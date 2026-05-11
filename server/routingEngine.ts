/**
 * PART 11 — Building-First Node Resolver
 *
 * Resolution order (deterministic, fully auditable):
 *   Step 1.  Building → default store mapping
 *   Step 2.  Node active check
 *   Step 3.  Licence / service status check
 *   Step 4.  Pharmacist coverage check
 *   Step 5.  Stock availability check
 *   Step 6.  Batch eligibility check (non-expired, non-recalled)
 *   Step 7.  Cold-chain capability check (if required)
 *   Step 8.  Controlled-drug capability check (if required)
 *   Step 9.  Rider capacity check
 *   Step 10. ETA calculation
 *   Step 11. Fallback to secondary store (repeat steps 2-10)
 *   Step 12. Pincode fallback (only after building mapping fails)
 *
 * Every resolution is logged to routing_decisions.
 */

import { getDb } from "./db";
import {
  buildings,
  stores,
  storeSkus,
  batches,
  riders,
  routingDecisions,
  storeCapabilities,
  orderTimestamps,
} from "../drizzle/schema";
import { eq, and, gt, sql, inArray } from "drizzle-orm";
import {
  haversineMetres,
  getDrivingEtaMins,
  formatEtaText as _formatEtaText,
} from "./location";

function formatEtaText(mins: number): string {
  return _formatEtaText(mins) ?? `~${mins} min`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StepResult {
  step: string;
  passed: boolean;
  reason?: string;
}

export interface NodeResolutionResult {
  storeId: number;
  storeName: string;
  storeAddress: string;
  storeLat: number;
  storeLng: number;
  etaMins: number;
  etaText: string;
  slaMins: number;
  resolutionPath:
    | "primary_assignment"
    | "geo_nearest"
    | "geo_nearest_with_stock"
    | "pincode_fallback"
    | "manual_override"
    | "no_store_found";
  stepResults: StepResult[];
  requiresColdChain: boolean;
  requiresControlledDrug: boolean;
  decisionId?: number;
}

export interface NodeResolutionContext {
  buildingId?: number;
  pincode?: string;
  requiredSkuIds?: number[]; // storeSkuIds to check stock for
  requiresColdChain?: boolean;
  requiresControlledDrug?: boolean;
  orderId?: number;
  triggeredBy?:
    | "checkout"
    | "whatsapp"
    | "admin_override"
    | "reallocation"
    | "system";
  triggeredByUserId?: number;
}

// ─── Step helpers ─────────────────────────────────────────────────────────────

async function checkNodeActive(
  db: any,
  storeId: number,
  steps: StepResult[]
): Promise<boolean> {
  const [store] = await db
    .select({ isActive: stores.isActive })
    .from(stores)
    .where(eq(stores.id, storeId))
    .limit(1);
  const passed = !!store?.isActive;
  steps.push({
    step: "node_active",
    passed,
    reason: passed ? undefined : "Store is inactive",
  });
  return passed;
}

async function checkLicenceService(
  db: any,
  storeId: number,
  steps: StepResult[]
): Promise<boolean> {
  const [cap] = await db
    .select({
      licenceActive: storeCapabilities.licenceActive,
      serviceActive: storeCapabilities.serviceActive,
      serviceInactiveReason: storeCapabilities.serviceInactiveReason,
      licenceExpiryDate: storeCapabilities.licenceExpiryDate,
    })
    .from(storeCapabilities)
    .where(eq(storeCapabilities.storeId, storeId))
    .limit(1);

  // No capabilities row = assume OK (not all stores have capabilities configured)
  if (!cap) {
    steps.push({
      step: "licence_service",
      passed: true,
      reason: "No capability record — assuming OK",
    });
    return true;
  }

  const now = new Date();
  const licenceExpired =
    cap.licenceExpiryDate && new Date(cap.licenceExpiryDate) < now;
  const passed = cap.licenceActive && cap.serviceActive && !licenceExpired;
  let reason: string | undefined;
  if (!cap.licenceActive) reason = "Licence inactive";
  else if (licenceExpired) reason = "Licence expired";
  else if (!cap.serviceActive)
    reason = cap.serviceInactiveReason ?? "Service inactive";
  steps.push({ step: "licence_service", passed, reason });
  return passed;
}

async function checkPharmacistCoverage(
  db: any,
  storeId: number,
  steps: StepResult[]
): Promise<boolean> {
  const [cap] = await db
    .select({ pharmacistCoverage: storeCapabilities.pharmacistCoverage })
    .from(storeCapabilities)
    .where(eq(storeCapabilities.storeId, storeId))
    .limit(1);
  const passed = cap ? cap.pharmacistCoverage : true;
  steps.push({
    step: "pharmacist_coverage",
    passed,
    reason: passed ? undefined : "No pharmacist on duty",
  });
  return passed;
}

async function checkStock(
  db: any,
  storeId: number,
  requiredSkuIds: number[],
  steps: StepResult[]
): Promise<boolean> {
  if (!requiredSkuIds.length) {
    steps.push({
      step: "stock_check",
      passed: true,
      reason: "No SKUs to check",
    });
    return true;
  }
  const skuRows = await db
    .select({ id: storeSkus.id, stockQty: storeSkus.stockQty })
    .from(storeSkus)
    .where(
      and(eq(storeSkus.storeId, storeId), inArray(storeSkus.id, requiredSkuIds))
    );
  const outOfStock = skuRows.filter((r: any) => (r.stockQty ?? 0) <= 0);
  const passed = outOfStock.length === 0;
  steps.push({
    step: "stock_check",
    passed,
    reason: passed
      ? undefined
      : `${outOfStock.length} SKU(s) out of stock: ${outOfStock.map((r: any) => r.id).join(", ")}`,
  });
  return passed;
}

async function checkBatchEligibility(
  db: any,
  storeId: number,
  requiredSkuIds: number[],
  steps: StepResult[]
): Promise<boolean> {
  if (!requiredSkuIds.length) {
    steps.push({
      step: "batch_eligibility",
      passed: true,
      reason: "No SKUs to check",
    });
    return true;
  }
  const now = new Date();
  const skuRows = await db
    .select({ storeSkuId: storeSkus.id })
    .from(storeSkus)
    .innerJoin(
      batches,
      and(
        eq(batches.storeId, storeSkus.storeId),
        eq(batches.productId, storeSkus.productId)
      )
    )
    .where(
      and(
        eq(storeSkus.storeId, storeId),
        inArray(storeSkus.id, requiredSkuIds),
        gt(batches.expiryDate, now),
        sql`${batches.status} != 'recalled'`,
        gt(batches.qtyOnHand, 0)
      )
    );
  const coveredSkus = new Set(skuRows.map((r: any) => r.storeSkuId));
  const missing = requiredSkuIds.filter(id => !coveredSkus.has(id));
  const passed = missing.length === 0;
  steps.push({
    step: "batch_eligibility",
    passed,
    reason: passed
      ? undefined
      : `${missing.length} SKU(s) have no eligible batch (expired/recalled/no stock)`,
  });
  return passed;
}

async function checkColdChain(
  db: any,
  storeId: number,
  required: boolean,
  steps: StepResult[]
): Promise<boolean> {
  if (!required) {
    steps.push({ step: "cold_chain", passed: true, reason: "Not required" });
    return true;
  }
  const [cap] = await db
    .select({ coldChainCapable: storeCapabilities.coldChainCapable })
    .from(storeCapabilities)
    .where(eq(storeCapabilities.storeId, storeId))
    .limit(1);
  const passed = cap ? cap.coldChainCapable : false;
  steps.push({
    step: "cold_chain",
    passed,
    reason: passed ? undefined : "Store lacks cold-chain capability",
  });
  return passed;
}

async function checkControlledDrug(
  db: any,
  storeId: number,
  required: boolean,
  steps: StepResult[]
): Promise<boolean> {
  if (!required) {
    steps.push({
      step: "controlled_drug",
      passed: true,
      reason: "Not required",
    });
    return true;
  }
  const [cap] = await db
    .select({ controlledDrugCapable: storeCapabilities.controlledDrugCapable })
    .from(storeCapabilities)
    .where(eq(storeCapabilities.storeId, storeId))
    .limit(1);
  const passed = cap ? cap.controlledDrugCapable : false;
  steps.push({
    step: "controlled_drug",
    passed,
    reason: passed ? undefined : "Store not licensed for controlled drugs",
  });
  return passed;
}

async function checkRiderCapacity(
  db: any,
  storeId: number,
  steps: StepResult[]
): Promise<boolean> {
  const [cap] = await db
    .select({
      maxRiderCapacity: storeCapabilities.maxRiderCapacity,
      currentRiderCount: storeCapabilities.currentRiderCount,
    })
    .from(storeCapabilities)
    .where(eq(storeCapabilities.storeId, storeId))
    .limit(1);

  if (!cap) {
    // Fallback: count active riders directly
    const [riderCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(riders)
      .where(
        and(
          eq(riders.storeId, storeId),
          eq(riders.status, "on_delivery"),
          eq(riders.isActive, true)
        )
      );
    const active = Number(riderCount?.count ?? 0);
    const passed = active < 10; // default max
    steps.push({
      step: "rider_capacity",
      passed,
      reason: passed ? undefined : `All riders busy (${active} active)`,
    });
    return passed;
  }

  const passed = cap.currentRiderCount < cap.maxRiderCapacity;
  steps.push({
    step: "rider_capacity",
    passed,
    reason: passed
      ? undefined
      : `Rider capacity full (${cap.currentRiderCount}/${cap.maxRiderCapacity})`,
  });
  return passed;
}

async function calculateEta(
  db: any,
  storeId: number,
  buildingId: number | undefined,
  steps: StepResult[]
): Promise<{ etaMins: number; etaSource: "google_maps" | "sla_fallback" }> {
  const [store] = await db
    .select({
      lat: stores.lat,
      lng: stores.lng,
      slaMins: stores.slaMins,
    })
    .from(stores)
    .where(eq(stores.id, storeId))
    .limit(1);

  if (!store) {
    steps.push({
      step: "eta_calculation",
      passed: true,
      reason: "Store not found, using default 30 min",
    });
    return { etaMins: 30, etaSource: "sla_fallback" };
  }

  // Try Google Maps if building has coordinates
  if (buildingId) {
    const [building] = await db
      .select({ lat: buildings.lat, lng: buildings.lng })
      .from(buildings)
      .where(eq(buildings.id, buildingId))
      .limit(1);
    if (building?.lat && building?.lng && store.lat && store.lng) {
      try {
        const drivingMins = await getDrivingEtaMins(
          parseFloat(String(store.lat)),
          parseFloat(String(store.lng)),
          parseFloat(String(building.lat)),
          parseFloat(String(building.lng))
        );
        if (drivingMins) {
          const etaMins = drivingMins + 5; // 5 min picking buffer
          steps.push({
            step: "eta_calculation",
            passed: true,
            reason: `Google Maps: ${drivingMins} min driving + 5 min picking`,
          });
          return { etaMins, etaSource: "google_maps" };
        }
      } catch (e) {
        // fall through to SLA fallback
      }
    }
  }

  const etaMins = (store.slaMins ?? 20) + 5;
  steps.push({
    step: "eta_calculation",
    passed: true,
    reason: `SLA fallback: ${store.slaMins} min + 5 min picking`,
  });
  return { etaMins, etaSource: "sla_fallback" };
}

// ─── Full 12-step check for a single store ───────────────────────────────────

async function runAllChecks(
  db: any,
  storeId: number,
  ctx: NodeResolutionContext,
  steps: StepResult[]
): Promise<boolean> {
  if (!(await checkNodeActive(db, storeId, steps))) return false;
  if (!(await checkLicenceService(db, storeId, steps))) return false;
  if (!(await checkPharmacistCoverage(db, storeId, steps))) return false;
  if (!(await checkStock(db, storeId, ctx.requiredSkuIds ?? [], steps)))
    return false;
  if (
    !(await checkBatchEligibility(db, storeId, ctx.requiredSkuIds ?? [], steps))
  )
    return false;
  if (
    !(await checkColdChain(db, storeId, ctx.requiresColdChain ?? false, steps))
  )
    return false;
  if (
    !(await checkControlledDrug(
      db,
      storeId,
      ctx.requiresControlledDrug ?? false,
      steps
    ))
  )
    return false;
  if (!(await checkRiderCapacity(db, storeId, steps))) return false;
  return true;
}

// ─── Log routing decision ─────────────────────────────────────────────────────

async function logDecision(
  db: any,
  ctx: NodeResolutionContext,
  result: Omit<NodeResolutionResult, "decisionId">,
  primaryStoreId: number | null,
  primaryRejectedReason: string | null,
  secondaryStoreId: number | null,
  secondaryRejectedReason: string | null,
  etaSource: "google_maps" | "sla_fallback"
): Promise<number | undefined> {
  try {
    const r = await db.insert(routingDecisions).values({
      orderId: ctx.orderId ?? null,
      buildingId: ctx.buildingId ?? null,
      requestedSkuIds: ctx.requiredSkuIds
        ? JSON.stringify(ctx.requiredSkuIds)
        : null,
      resolvedStoreId: result.storeId > 0 ? result.storeId : null,
      resolutionPath: result.resolutionPath,
      stepResults: JSON.stringify(result.stepResults),
      primaryStoreId,
      primaryStoreRejectedReason: primaryRejectedReason,
      secondaryStoreId,
      secondaryStoreRejectedReason: secondaryRejectedReason,
      pincodeUsed: ctx.pincode ?? null,
      etaMins: result.etaMins,
      etaSource,
      requiresColdChain: ctx.requiresColdChain ?? false,
      requiresControlledDrug: ctx.requiresControlledDrug ?? false,
      triggeredBy: ctx.triggeredBy ?? "checkout",
      triggeredByUserId: ctx.triggeredByUserId ?? null,
    });
    return r.insertId as number;
  } catch (e) {
    console.error("[RoutingEngine] Failed to log decision:", e);
    return undefined;
  }
}

// ─── Main resolver ────────────────────────────────────────────────────────────

export async function resolveNode(
  ctx: NodeResolutionContext
): Promise<NodeResolutionResult | null> {
  const db = await getDb();
  if (!db) return null;

  const allSteps: StepResult[] = [];
  let primaryStoreId: number | null = null;
  let primaryRejectedReason: string | null = null;
  let secondaryStoreId: number | null = null;
  let secondaryRejectedReason: string | null = null;
  let etaSource: "google_maps" | "sla_fallback" = "sla_fallback";

  // ── Step 1: Building → default store mapping ──────────────────────────────
  if (ctx.buildingId) {
    const [building] = await db
      .select({
        primaryStoreId: buildings.primaryStoreId,
        fallbackStoreId: buildings.fallbackStoreId,
        lat: buildings.lat,
        lng: buildings.lng,
      })
      .from(buildings)
      .where(eq(buildings.id, ctx.buildingId))
      .limit(1);

    allSteps.push({
      step: "building_mapping",
      passed: !!building,
      reason: building
        ? `Building found, primary store: ${building.primaryStoreId}`
        : "Building not found",
    });

    if (building?.primaryStoreId) {
      primaryStoreId = building.primaryStoreId;
      const primarySteps: StepResult[] = [];

      // Steps 2-9 for primary store
      const primaryOk = await runAllChecks(
        db,
        building.primaryStoreId,
        ctx,
        primarySteps
      );
      allSteps.push(...primarySteps);

      if (primaryOk) {
        // Step 10: ETA
        const { etaMins, etaSource: src } = await calculateEta(
          db,
          building.primaryStoreId,
          ctx.buildingId,
          allSteps
        );
        etaSource = src;

        const [store] = await db
          .select({
            name: stores.name,
            address: stores.address,
            lat: stores.lat,
            lng: stores.lng,
            slaMins: stores.slaMins,
          })
          .from(stores)
          .where(eq(stores.id, building.primaryStoreId))
          .limit(1);

        const result: Omit<NodeResolutionResult, "decisionId"> = {
          storeId: building.primaryStoreId,
          storeName: store?.name ?? "Unknown",
          storeAddress: store?.address ?? "",
          storeLat: parseFloat(String(store?.lat ?? "0")),
          storeLng: parseFloat(String(store?.lng ?? "0")),
          etaMins,
          etaText: formatEtaText(etaMins),
          slaMins: store?.slaMins ?? 20,
          resolutionPath: "primary_assignment",
          stepResults: allSteps,
          requiresColdChain: ctx.requiresColdChain ?? false,
          requiresControlledDrug: ctx.requiresControlledDrug ?? false,
        };

        const decisionId = await logDecision(
          db,
          ctx,
          result,
          primaryStoreId,
          null,
          null,
          null,
          etaSource
        );
        return { ...result, decisionId };
      } else {
        primaryRejectedReason =
          primarySteps.find(s => !s.passed)?.reason ?? "Failed checks";
      }

      // Step 11: Fallback to secondary store
      if (
        building.fallbackStoreId &&
        building.fallbackStoreId !== building.primaryStoreId
      ) {
        secondaryStoreId = building.fallbackStoreId;
        const secondarySteps: StepResult[] = [];
        const secondaryOk = await runAllChecks(
          db,
          building.fallbackStoreId,
          ctx,
          secondarySteps
        );
        allSteps.push(
          ...secondarySteps.map(s => ({ ...s, step: `secondary_${s.step}` }))
        );

        if (secondaryOk) {
          const { etaMins, etaSource: src } = await calculateEta(
            db,
            building.fallbackStoreId,
            ctx.buildingId,
            allSteps
          );
          etaSource = src;

          const [store] = await db
            .select({
              name: stores.name,
              address: stores.address,
              lat: stores.lat,
              lng: stores.lng,
              slaMins: stores.slaMins,
            })
            .from(stores)
            .where(eq(stores.id, building.fallbackStoreId))
            .limit(1);

          const result: Omit<NodeResolutionResult, "decisionId"> = {
            storeId: building.fallbackStoreId,
            storeName: store?.name ?? "Unknown",
            storeAddress: store?.address ?? "",
            storeLat: parseFloat(String(store?.lat ?? "0")),
            storeLng: parseFloat(String(store?.lng ?? "0")),
            etaMins,
            etaText: formatEtaText(etaMins),
            slaMins: store?.slaMins ?? 20,
            resolutionPath: "geo_nearest",
            stepResults: allSteps,
            requiresColdChain: ctx.requiresColdChain ?? false,
            requiresControlledDrug: ctx.requiresControlledDrug ?? false,
          };

          const decisionId = await logDecision(
            db,
            ctx,
            result,
            primaryStoreId,
            primaryRejectedReason,
            secondaryStoreId,
            null,
            etaSource
          );
          return { ...result, decisionId };
        } else {
          secondaryRejectedReason =
            secondarySteps.find(s => !s.passed)?.reason ?? "Failed checks";
        }
      }
    }
  }

  // Step 12: Pincode fallback — find nearest active store by pincode or geo
  allSteps.push({
    step: "pincode_fallback",
    passed: true,
    reason: "Attempting pincode/geo fallback",
  });

  const allStores = await db
    .select({
      id: stores.id,
      name: stores.name,
      address: stores.address,
      lat: stores.lat,
      lng: stores.lng,
      slaMins: stores.slaMins,
      isActive: stores.isActive,
      pincode: stores.pincode,
      serviceRadius: stores.serviceRadius,
    })
    .from(stores)
    .where(eq(stores.isActive, true));

  // Filter by pincode if provided
  let candidates = ctx.pincode
    ? allStores.filter((s: any) => s.pincode === ctx.pincode)
    : allStores;

  if (!candidates.length) candidates = allStores;

  // Sort by distance if building has coordinates
  if (ctx.buildingId) {
    const [building] = await db
      .select({ lat: buildings.lat, lng: buildings.lng })
      .from(buildings)
      .where(eq(buildings.id, ctx.buildingId))
      .limit(1);
    if (building?.lat && building?.lng) {
      const bLat = parseFloat(String(building.lat));
      const bLng = parseFloat(String(building.lng));
      candidates = candidates
        .filter((s: any) => s.lat && s.lng)
        .sort(
          (a: any, b: any) =>
            haversineMetres(
              bLat,
              bLng,
              parseFloat(String(a.lat)),
              parseFloat(String(a.lng))
            ) -
            haversineMetres(
              bLat,
              bLng,
              parseFloat(String(b.lat)),
              parseFloat(String(b.lng))
            )
        );
    }
  }

  for (const candidate of candidates.slice(0, 5)) {
    const fallbackSteps: StepResult[] = [];
    const ok = await runAllChecks(db, candidate.id, ctx, fallbackSteps);
    allSteps.push(
      ...fallbackSteps.map((s: StepResult) => ({
        ...s,
        step: `pincode_${s.step}`,
      }))
    );

    if (ok) {
      const { etaMins, etaSource: src } = await calculateEta(
        db,
        candidate.id,
        ctx.buildingId,
        allSteps
      );
      etaSource = src;

      const result: Omit<NodeResolutionResult, "decisionId"> = {
        storeId: candidate.id,
        storeName: candidate.name,
        storeAddress: candidate.address ?? "",
        storeLat: parseFloat(String(candidate.lat ?? "0")),
        storeLng: parseFloat(String(candidate.lng ?? "0")),
        etaMins,
        etaText: formatEtaText(etaMins),
        slaMins: candidate.slaMins ?? 20,
        resolutionPath: "pincode_fallback",
        stepResults: allSteps,
        requiresColdChain: ctx.requiresColdChain ?? false,
        requiresControlledDrug: ctx.requiresControlledDrug ?? false,
      };

      const decisionId = await logDecision(
        db,
        ctx,
        result,
        primaryStoreId,
        primaryRejectedReason,
        secondaryStoreId,
        secondaryRejectedReason,
        etaSource
      );
      return { ...result, decisionId };
    }
  }

  // No store found
  const noResult: Omit<NodeResolutionResult, "decisionId"> = {
    storeId: 0,
    storeName: "",
    storeAddress: "",
    storeLat: 0,
    storeLng: 0,
    etaMins: 0,
    etaText: "Unavailable",
    slaMins: 0,
    resolutionPath: "no_store_found",
    stepResults: allSteps,
    requiresColdChain: ctx.requiresColdChain ?? false,
    requiresControlledDrug: ctx.requiresControlledDrug ?? false,
  };

  await logDecision(
    db,
    ctx,
    noResult,
    primaryStoreId,
    primaryRejectedReason,
    secondaryStoreId,
    secondaryRejectedReason,
    etaSource
  );
  return null;
}

// ─── Record order lifecycle timestamp ────────────────────────────────────────

export async function recordOrderTimestamp(
  orderId: number,
  event:
    | "order_placed"
    | "prescription_uploaded"
    | "pharmacist_approved"
    | "allocation_completed"
    | "reservation_confirmed"
    | "picking_started"
    | "packed"
    | "rider_assigned"
    | "pickup_confirmed"
    | "out_for_delivery"
    | "delivered"
    | "failed_attempt"
    | "returned"
    | "cancelled"
    | "sla_breached"
    | "clarification_requested"
    | "rejected",
  actorId?: number | null,
  actorType?: "customer" | "pharmacist" | "rider" | "system" | "admin",
  note?: string,
  breachReason?: string,
  minutesLate?: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(orderTimestamps).values({
      orderId,
      event,
      actorId: actorId ?? null,
      actorType: actorType ?? "system",
      note: note ?? null,
      breachReason: breachReason ?? null,
      minutesLate: minutesLate ?? null,
    });
  } catch (e) {
    console.error("[RoutingEngine] Failed to record order timestamp:", e);
  }
}
