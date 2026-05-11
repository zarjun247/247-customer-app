import { getDb } from "./db";
import {
  buildings,
  stores,
  routingDecisions,
  orderTimestamps,
} from "../drizzle/schema";
import { eq } from "drizzle-orm";
import {
  haversineMetres,
  getDrivingEtaMins,
  formatEtaText as _formatEtaText,
} from "./location";
import {
  checkNodeActive,
  checkLicenceService,
  checkPharmacistCoverage,
  checkStock,
  checkBatchEligibility,
  checkColdChain,
  checkControlledDrug,
  checkRiderCapacity,
  type StepResult,
  type NodeResolutionResult,
  type NodeResolutionContext,
} from "./routingEngine";

function formatEtaText(mins: number): string {
  return _formatEtaText(mins) ?? `~${mins} min`;
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
          const etaMins = drivingMins + 5;
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

      const primaryOk = await runAllChecks(
        db,
        building.primaryStoreId,
        ctx,
        primarySteps
      );
      allSteps.push(...primarySteps);

      if (primaryOk) {
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

  let candidates = ctx.pincode
    ? allStores.filter((s: any) => s.pincode === ctx.pincode)
    : allStores;

  if (!candidates.length) candidates = allStores;

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
