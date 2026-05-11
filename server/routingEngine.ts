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

export async function checkNodeActive(
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

export async function checkLicenceService(
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

export async function checkPharmacistCoverage(
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

export async function checkStock(
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

export async function checkBatchEligibility(
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

export async function checkColdChain(
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

export async function checkControlledDrug(
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

export async function checkRiderCapacity(
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

export * from "./routingEnginePart2";
