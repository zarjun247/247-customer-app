/**
 * 24/7 Pharmacy — Building-First Routing Engine
 *
 * Resolution order (deterministic, auditable):
 *   1. Building's assigned primary store (highest priority — pre-configured by ops)
 *   2. Nearest active store by Haversine distance (geo fallback)
 *   3. Stock availability filter (ensures resolved store has stock for the session)
 *
 * ETA computation:
 *   - Google Maps Distance Matrix API (driving, best-guess traffic model)
 *   - Falls back to store.slaMins if Maps API is unavailable
 *
 * Internal terminology uses "node" freely.
 * Customer-facing output uses "Serving pharmacy" / "Local 24/7 pharmacy".
 */

import axios from "axios";
import { getDb } from "./db";
import { buildings, stores, storeSkus } from "../drizzle/schema";
import { eq, and, gt, sql } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RoutingResult {
  storeId: number;
  storeName: string;
  storeAddress: string;
  storeLat: number;
  storeLng: number;
  etaMins: number;
  slaMins: number;
  resolutionPath: "primary_assignment" | "geo_nearest" | "geo_nearest_with_stock";
  displayLabel: string; // customer-facing label
}

export interface RoutingContext {
  buildingId: number;
  /** Optional: if provided, routing will verify the resolved store has stock for these SKUs */
  requiredSkuIds?: number[];
  /** Google Maps API key — injected from env */
  mapsApiKey?: string;
}

// ─── Haversine distance (metres) ─────────────────────────────────────────────

function haversineMetres(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6_371_000; // Earth radius in metres
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Google Maps Distance Matrix ETA ─────────────────────────────────────────

async function getGoogleMapsEta(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  apiKey: string
): Promise<number | null> {
  try {
    const url = "https://maps.googleapis.com/maps/api/distancematrix/json";
    const res = await axios.get(url, {
      params: {
        origins: `${originLat},${originLng}`,
        destinations: `${destLat},${destLng}`,
        mode: "driving",
        departure_time: "now",
        traffic_model: "best_guess",
        key: apiKey,
      },
      timeout: 4000,
    });
    const element = res.data?.rows?.[0]?.elements?.[0];
    if (element?.status === "OK") {
      const durationSecs =
        element.duration_in_traffic?.value ?? element.duration?.value ?? null;
      if (durationSecs) return Math.ceil(durationSecs / 60);
    }
    return null;
  } catch {
    return null;
  }
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

  // ── Pass 1: Primary assignment ──────────────────────────────────────────────
  let resolvedStore = allStores.find((s) => s.id === building.primaryStoreId) ?? null;
  let resolutionPath: RoutingResult["resolutionPath"] = "primary_assignment";

  // ── Pass 2: Geo nearest (if no primary assignment or primary is inactive) ───
  if (!resolvedStore && buildingLat !== null && buildingLng !== null) {
    const withDistance = allStores
      .filter((s) => s.lat && s.lng)
      .map((s) => ({
        store: s,
        distanceM: haversineMetres(
          buildingLat, buildingLng,
          Number(s.lat), Number(s.lng)
        ),
      }))
      .sort((a, b) => a.distanceM - b.distanceM);

    if (withDistance.length > 0) {
      resolvedStore = withDistance[0].store;
      resolutionPath = "geo_nearest";
    }
  }

  // ── Pass 3: Stock availability filter ──────────────────────────────────────
  if (resolvedStore && ctx.requiredSkuIds && ctx.requiredSkuIds.length > 0) {
    const hasStock = await checkStoreHasStock(resolvedStore.id, ctx.requiredSkuIds);
    if (!hasStock) {
      // Try next nearest store that has stock
      if (buildingLat !== null && buildingLng !== null) {
        const candidates = allStores
          .filter((s) => s.lat && s.lng && s.id !== resolvedStore!.id)
          .map((s) => ({
            store: s,
            distanceM: haversineMetres(
              buildingLat, buildingLng,
              Number(s.lat), Number(s.lng)
            ),
          }))
          .sort((a, b) => a.distanceM - b.distanceM);

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
  }

  if (!resolvedStore) return null;

  // ── ETA computation ─────────────────────────────────────────────────────────
  let etaMins = resolvedStore.slaMins;

  if (
    buildingLat !== null &&
    buildingLng !== null &&
    resolvedStore.lat &&
    resolvedStore.lng &&
    ctx.mapsApiKey
  ) {
    const mapsEta = await getGoogleMapsEta(
      Number(resolvedStore.lat),
      Number(resolvedStore.lng),
      buildingLat,
      buildingLng,
      ctx.mapsApiKey
    );
    if (mapsEta !== null) {
      // Add a 5-minute picking buffer to raw driving time
      etaMins = mapsEta + 5;
    }
  }

  return {
    storeId: resolvedStore.id,
    storeName: resolvedStore.name,
    storeAddress: resolvedStore.address ?? "",
    storeLat: Number(resolvedStore.lat ?? 0),
    storeLng: Number(resolvedStore.lng ?? 0),
    etaMins,
    slaMins: resolvedStore.slaMins,
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

  // Check that all requested SKUs have available stock at this store
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

  // If the store has at least one of the required SKUs in stock, it's viable
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
    `(${result.resolutionPath}) eta=${result.etaMins}min`
  );
}
