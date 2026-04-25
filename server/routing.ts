/**
 * 24/7 Pharmacy — Building-First Routing Engine
 *
 * Resolution order (deterministic, auditable):
 *   1. Building's assigned primary store (highest priority — pre-configured by ops)
 *      Only used if the store is active AND the building is within its serviceRadius.
 *   2. Nearest active store whose serviceRadius covers the building (geo fallback)
 *   3. Stock availability filter (ensures resolved store has stock for the session)
 *
 * ETA computation:
 *   - Google Maps Distance Matrix API via Manus proxy (driving, best-guess traffic)
 *   - Falls back to store.slaMins + 5 min picking buffer if Maps API is unavailable
 *
 * Opening hours:
 *   - Stored as JSON in stores.openingHours (see server/location.ts for format)
 *   - isStoreOpenNow() computes open status in IST
 */
import { getDb } from "./db";
import { buildings, stores, storeSkus } from "../drizzle/schema";
import { eq, and, gt, sql } from "drizzle-orm";
import {
  haversineMetres,
  getDrivingEtaMins,
  isStoreOpenNow,
  getTodayHoursText,
  formatEtaText,
} from "./location";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RoutingResult {
  storeId: number;
  storeName: string;
  storeAddress: string;
  storeLat: number;
  storeLng: number;
  etaMins: number;
  etaText: string;              // customer-safe: "Arriving in ~X min"
  slaMins: number;
  openNow: boolean;
  openingHoursText: string;
  resolutionPath: "primary_assignment" | "geo_nearest" | "geo_nearest_with_stock";
  displayLabel: string; // customer-facing label
}

export interface RoutingContext {
  buildingId: number;
  /** Optional: if provided, routing will verify the resolved store has stock for these SKUs */
  requiredSkuIds?: number[];
}

// ─── Core routing function ────────────────────────────────────────────────────

export async function resolveStore(ctx: RoutingContext): Promise<RoutingResult | null> {
  const db = await getDb();
  if (!db) return null;

  // 1. Load the building with its assigned stores
  const [building] = await db
    .select()
    .from(buildings)
    .where(eq(buildings.id, ctx.buildingId))
    .limit(1);
  if (!building) return null;

  const buildingLat = building.lat ? Number(building.lat) : null;
  const buildingLng = building.lng ? Number(building.lng) : null;

  // 2. Load all active stores
  const allStores = await db
    .select()
    .from(stores)
    .where(eq(stores.isActive, true));
  if (allStores.length === 0) return null;

  // Compute distances once
  const withDistance =
    buildingLat !== null && buildingLng !== null
      ? allStores
          .filter((s) => s.lat && s.lng)
          .map((s) => ({
            store: s,
            distanceM: haversineMetres(
              buildingLat, buildingLng,
              Number(s.lat), Number(s.lng)
            ),
          }))
          .sort((a, b) => a.distanceM - b.distanceM)
      : [];

  let resolvedStore: (typeof allStores)[0] | null = null;
  let resolutionPath: RoutingResult["resolutionPath"] = "primary_assignment";

  // ── Pass 1: Primary assignment (must be within serviceRadius) ───────────────
  if (building.primaryStoreId) {
    const primary = withDistance.find(
      (w) => w.store.id === building.primaryStoreId
    );
    if (primary && primary.distanceM <= primary.store.serviceRadius) {
      resolvedStore = primary.store;
      resolutionPath = "primary_assignment";
    }
  }

  // ── Pass 2: Geo nearest within serviceRadius ────────────────────────────────
  if (!resolvedStore) {
    const nearest = withDistance.find(
      (w) => w.distanceM <= w.store.serviceRadius
    );
    if (nearest) {
      resolvedStore = nearest.store;
      resolutionPath = "geo_nearest";
    }
  }

  // ── Pass 3: Stock availability filter ──────────────────────────────────────
  if (resolvedStore && ctx.requiredSkuIds && ctx.requiredSkuIds.length > 0) {
    const hasStock = await checkStoreHasStock(resolvedStore.id, ctx.requiredSkuIds);
    if (!hasStock) {
      const candidates = withDistance.filter(
        (w) => w.store.id !== resolvedStore!.id && w.distanceM <= w.store.serviceRadius
      );
      for (const candidate of candidates) {
        const candidateHasStock = await checkStoreHasStock(
          candidate.store.id,
          ctx.requiredSkuIds!
        );
        if (candidateHasStock) {
          resolvedStore = candidate.store;
          resolutionPath = "geo_nearest_with_stock";
          break;
        }
      }
    }
  }

  if (!resolvedStore) return null;

  // ── ETA computation ─────────────────────────────────────────────────────────
  let etaMins = resolvedStore.slaMins;
  if (buildingLat !== null && buildingLng !== null && resolvedStore.lat && resolvedStore.lng) {
    const mapsEta = await getDrivingEtaMins(
      Number(resolvedStore.lat), Number(resolvedStore.lng),
      buildingLat, buildingLng
    );
    if (mapsEta !== null) {
      etaMins = mapsEta; // getDrivingEtaMins already adds 5-min picking buffer
    }
  }

  const openNow = isStoreOpenNow(resolvedStore.openingHours ?? null);
  const openingHoursText = getTodayHoursText(resolvedStore.openingHours ?? null);

  return {
    storeId: resolvedStore.id,
    storeName: resolvedStore.name,
    storeAddress: resolvedStore.address ?? "",
    storeLat: Number(resolvedStore.lat ?? 0),
    storeLng: Number(resolvedStore.lng ?? 0),
    etaMins,
    etaText: formatEtaText(etaMins) ?? `~${etaMins} min`,
    slaMins: resolvedStore.slaMins,
    openNow,
    openingHoursText,
    resolutionPath,
    displayLabel: "Serving from your local 24/7 pharmacy",
  };
}

// ─── Stock check helper ───────────────────────────────────────────────────────

async function checkStoreHasStock(
  storeId: number,
  skuIds: number[]
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const [result] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(storeSkus)
    .where(
      and(
        eq(storeSkus.storeId, storeId),
        eq(storeSkus.isActive, true),
        gt(sql`${storeSkus.stockQty} - ${storeSkus.softLockedQty}`, 0)
      )
    );
  return (result?.count ?? 0) > 0;
}

// ─── Routing audit log helper ─────────────────────────────────────────────────

export function formatRoutingAuditEntry(
  ctx: RoutingContext,
  result: RoutingResult | null
): string {
  if (!result) {
    return `[ROUTING] buildingId=${ctx.buildingId} → NO_STORE_RESOLVED`;
  }
  return (
    `[ROUTING] buildingId=${ctx.buildingId} → storeId=${result.storeId} ` +
    `(${result.resolutionPath}) eta=${result.etaMins}min openNow=${result.openNow}`
  );
}
