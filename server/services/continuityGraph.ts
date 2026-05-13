import { and, desc, eq, gte } from "drizzle-orm";
import pino from "pino";
import { getDb } from "../db";
import { sales, saleLines } from "../../drizzle/schema";
import { ENV } from "../_core/env";

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });

export type ContinuityNode =
  | {
      kind: "customer";
      id: string;
      metadata?: { name?: string; loyaltyTier?: string };
    }
  | {
      kind: "product";
      id: string;
      metadata?: { name?: string; schedule?: string };
    };

export type ContinuityEdge = {
  fromCustomerId: string;
  toProductId: string;
  purchaseCount: number;
  daysCovered: number;
  averageIntervalDays: number;
  intervalVariance: number;
  lastPurchaseAt: Date;
  continuityScore: number;
};

type PurchaseRecord = {
  productId: string;
  purchasedAt: Date;
  qty: number;
  schedule: string | null;
};

function computeIntervalStats(dates: Date[]): {
  average: number;
  variance: number;
} {
  if (dates.length < 2) return { average: 0, variance: 0 };
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    gaps.push(
      (sorted[i].getTime() - sorted[i - 1].getTime()) / (1000 * 60 * 60 * 24)
    );
  }
  const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  const variance =
    gaps.length > 1
      ? gaps.reduce((s, g) => s + Math.pow(g - mean, 2), 0) / gaps.length
      : 0;
  return { average: mean, variance };
}

function computeContinuityScore(
  purchaseCount: number,
  intervalStats: { average: number; variance: number },
  schedule: string | null
): number {
  let score = 0;

  if (purchaseCount >= 4) {
    score = 0.8;
  } else if (purchaseCount >= 2) {
    score = 0.5;
  } else {
    score = 0.2;
  }

  // High variance lowers confidence (penalize up to -0.2)
  if (purchaseCount >= 2 && intervalStats.average > 0) {
    const cv = Math.sqrt(intervalStats.variance) / intervalStats.average;
    score -= Math.min(0.2, cv * 0.2);
  }

  // Regulated products get a +0.1 baseline boost (chronic/controlled use)
  if (schedule === "H" || schedule === "H1" || schedule === "X") {
    score += 0.1;
  }

  return Math.max(0, Math.min(1, score));
}

export async function buildCustomerContinuityGraph(
  customerId: string,
  options?: { lookbackDays?: number; maxEdges?: number }
): Promise<{ nodes: ContinuityNode[]; edges: ContinuityEdge[] }> {
  const lookbackDays = options?.lookbackDays ?? ENV.refillRiskLookbackDays;
  const maxEdges = options?.maxEdges ?? ENV.continuityGraphMaxNodes;
  const db = await getDb();
  if (!db) {
    logger.error({ customerId }, "continuityGraph: DB unavailable");
    return { nodes: [], edges: [] };
  }

  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      productId: saleLines.productId,
      createdAt: sales.createdAt,
      qty: saleLines.qty,
      schedule: saleLines.scheduleCode,
    })
    .from(saleLines)
    .innerJoin(sales, eq(saleLines.saleId, sales.id))
    .where(
      and(
        eq(sales.customerId, customerId),
        eq(sales.status, "confirmed"),
        gte(sales.createdAt, since.getTime())
      )
    )
    .orderBy(desc(sales.createdAt));

  if (rows.length === 0) {
    return { nodes: [{ kind: "customer", id: customerId }], edges: [] };
  }

  // Group by product
  const byProduct = new Map<string, PurchaseRecord[]>();
  for (const row of rows) {
    const existing = byProduct.get(row.productId) ?? [];
    existing.push({
      productId: row.productId,
      purchasedAt: new Date(Number(row.createdAt)),
      qty: row.qty,
      schedule: row.schedule,
    });
    byProduct.set(row.productId, existing);
  }

  const edges: ContinuityEdge[] = [];
  for (const [productId, purchases] of Array.from(byProduct)) {
    const dates = purchases.map((p: PurchaseRecord) => p.purchasedAt);
    const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
    const firstPurchase = sorted[0];
    const lastPurchase = sorted[sorted.length - 1];
    const daysCovered =
      (lastPurchase.getTime() - firstPurchase.getTime()) /
      (1000 * 60 * 60 * 24);
    const intervalStats = computeIntervalStats(dates);
    const schedule = purchases[0].schedule;
    const continuityScore = computeContinuityScore(
      purchases.length,
      intervalStats,
      schedule
    );

    edges.push({
      fromCustomerId: customerId,
      toProductId: productId,
      purchaseCount: purchases.length,
      daysCovered,
      averageIntervalDays: intervalStats.average,
      intervalVariance: intervalStats.variance,
      lastPurchaseAt: lastPurchase,
      continuityScore,
    });
  }

  // Sort by continuityScore desc, limit to maxEdges
  edges.sort((a, b) => b.continuityScore - a.continuityScore);
  const limitedEdges = edges.slice(0, maxEdges);

  const productNodes: ContinuityNode[] = limitedEdges.map(e => ({
    kind: "product" as const,
    id: e.toProductId,
  }));

  return {
    nodes: [{ kind: "customer", id: customerId }, ...productNodes],
    edges: limitedEdges,
  };
}

export async function buildProductContinuityGraph(
  productId: string,
  options?: { storeId?: string; lookbackDays?: number; maxEdges?: number }
): Promise<{ nodes: ContinuityNode[]; edges: ContinuityEdge[] }> {
  const lookbackDays = options?.lookbackDays ?? ENV.refillRiskLookbackDays;
  const maxEdges = options?.maxEdges ?? ENV.continuityGraphMaxNodes;
  const db = await getDb();
  if (!db) return { nodes: [], edges: [] };

  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  const conditions = [
    eq(saleLines.productId, productId),
    eq(sales.status, "confirmed"),
    gte(sales.createdAt, since.getTime()),
  ];
  if (options?.storeId) {
    conditions.push(eq(sales.storeId, options.storeId));
  }

  const rows = await db
    .select({
      customerId: sales.customerId,
      createdAt: sales.createdAt,
      qty: saleLines.qty,
      schedule: saleLines.scheduleCode,
    })
    .from(saleLines)
    .innerJoin(sales, eq(saleLines.saleId, sales.id))
    .where(and(...conditions))
    .orderBy(desc(sales.createdAt));

  // Filter out rows with no customer (walk-in sales)
  const customerRows = rows.filter(r => r.customerId != null);

  if (customerRows.length === 0) {
    return { nodes: [{ kind: "product", id: productId }], edges: [] };
  }

  // Group by customer
  const byCustomer = new Map<
    string,
    Array<{ purchasedAt: Date; qty: number; schedule: string | null }>
  >();
  for (const row of customerRows) {
    const cid = row.customerId!;
    const existing = byCustomer.get(cid) ?? [];
    existing.push({
      purchasedAt: new Date(Number(row.createdAt)),
      qty: row.qty,
      schedule: row.schedule,
    });
    byCustomer.set(cid, existing);
  }

  const edges: ContinuityEdge[] = [];
  for (const [customerId, purchases] of Array.from(byCustomer)) {
    const dates = purchases.map(
      (p: { purchasedAt: Date; qty: number; schedule: string | null }) =>
        p.purchasedAt
    );
    const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
    const daysCovered =
      (sorted[sorted.length - 1].getTime() - sorted[0].getTime()) /
      (1000 * 60 * 60 * 24);
    const intervalStats = computeIntervalStats(dates);
    const schedule = purchases[0].schedule;
    const continuityScore = computeContinuityScore(
      purchases.length,
      intervalStats,
      schedule
    );
    edges.push({
      fromCustomerId: customerId,
      toProductId: productId,
      purchaseCount: purchases.length,
      daysCovered,
      averageIntervalDays: intervalStats.average,
      intervalVariance: intervalStats.variance,
      lastPurchaseAt: sorted[sorted.length - 1],
      continuityScore,
    });
  }

  edges.sort((a, b) => b.continuityScore - a.continuityScore);
  const limitedEdges = edges.slice(0, maxEdges);

  const customerNodes: ContinuityNode[] = limitedEdges.map(e => ({
    kind: "customer" as const,
    id: e.fromCustomerId,
  }));

  return {
    nodes: [{ kind: "product", id: productId }, ...customerNodes],
    edges: limitedEdges,
  };
}

export async function identifyContinuityCriticalSkus(
  storeId: string,
  options?: { minCustomersAffected?: number; minContinuityScore?: number }
): Promise<
  Array<{
    productId: string;
    customersAffected: number;
    aggregateContinuityScore: number;
  }>
> {
  const minCustomersAffected = options?.minCustomersAffected ?? 3;
  const minContinuityScore = options?.minContinuityScore ?? 0.6;
  const lookbackDays = ENV.refillRiskLookbackDays;
  const db = await getDb();
  if (!db) return [];

  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      customerId: sales.customerId,
      productId: saleLines.productId,
      createdAt: sales.createdAt,
      schedule: saleLines.scheduleCode,
    })
    .from(saleLines)
    .innerJoin(sales, eq(saleLines.saleId, sales.id))
    .where(
      and(
        eq(sales.storeId, storeId),
        eq(sales.status, "confirmed"),
        gte(sales.createdAt, since.getTime())
      )
    );

  const customerRows = rows.filter(r => r.customerId != null);

  // Group by product → customer → purchases
  const byProduct = new Map<
    string,
    Map<string, Array<{ purchasedAt: Date; schedule: string | null }>>
  >();
  for (const row of customerRows) {
    const pid = row.productId;
    const cid = row.customerId!;
    if (!byProduct.has(pid)) byProduct.set(pid, new Map());
    const byCustomer = byProduct.get(pid)!;
    const existing = byCustomer.get(cid) ?? [];
    existing.push({
      purchasedAt: new Date(Number(row.createdAt)),
      schedule: row.schedule,
    });
    byCustomer.set(cid, existing);
  }

  const results: Array<{
    productId: string;
    customersAffected: number;
    aggregateContinuityScore: number;
  }> = [];

  for (const [productId, byCustomer] of Array.from(byProduct)) {
    let totalScore = 0;
    let qualifyingCustomers = 0;

    for (const [, purchases] of Array.from(byCustomer)) {
      const intervalStats = computeIntervalStats(
        purchases.map(
          (p: { purchasedAt: Date; schedule: string | null }) => p.purchasedAt
        )
      );
      const score = computeContinuityScore(
        purchases.length,
        intervalStats,
        purchases[0].schedule
      );
      if (score >= minContinuityScore) {
        totalScore += score;
        qualifyingCustomers++;
      }
    }

    if (qualifyingCustomers >= minCustomersAffected) {
      results.push({
        productId,
        customersAffected: qualifyingCustomers,
        aggregateContinuityScore:
          qualifyingCustomers > 0 ? totalScore / qualifyingCustomers : 0,
      });
    }
  }

  results.sort(
    (a, b) => b.aggregateContinuityScore - a.aggregateContinuityScore
  );
  return results;
}
