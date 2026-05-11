import { and, desc, eq, gte } from "drizzle-orm";
import pino from "pino";
import { getDb } from "../db";
import { sales, saleLines } from "../../drizzle/schema";
import { ENV } from "../_core/env";

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type CustomerRefillRisk = {
  customerId: string;
  productId: string;
  purchaseCount: number;
  averageIntervalDays: number;
  lastPurchaseDaysAgo: number;
  daysUntilRefillDue: number;
  riskLevel: RiskLevel;
  riskScore: number;
  schedule: string | null;
};

const RISK_ORDER: Record<RiskLevel, number> = { critical: 4, high: 3, medium: 2, low: 1 };

function computeAverageInterval(sorted: Date[]): number {
  if (sorted.length < 2) return 0;
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    gaps.push((sorted[i].getTime() - sorted[i - 1].getTime()) / (1000 * 60 * 60 * 24));
  }
  return gaps.reduce((s, g) => s + g, 0) / gaps.length;
}

function computeRisk(
  purchaseCount: number,
  averageIntervalDays: number,
  daysSinceLast: number,
  schedule: string | null,
): { riskLevel: RiskLevel; riskScore: number; daysUntilRefillDue: number } {
  if (purchaseCount < 2 || averageIntervalDays <= 0) {
    return { riskLevel: "low", riskScore: 0.1, daysUntilRefillDue: -1 };
  }

  const ratio = daysSinceLast / averageIntervalDays;
  const daysUntilRefillDue = Math.round(averageIntervalDays - daysSinceLast);

  let riskScore = Math.min(1, ratio / 2);
  if (schedule === "H" || schedule === "H1" || schedule === "X") {
    riskScore = Math.min(1, riskScore + 0.05);
  }

  let riskLevel: RiskLevel;
  if (ratio >= 1.5) {
    riskLevel = "critical";
  } else if (ratio >= 1.2) {
    riskLevel = "high";
  } else if (ratio >= 1.0) {
    riskLevel = "medium";
  } else {
    riskLevel = "low";
  }

  return { riskLevel, riskScore, daysUntilRefillDue };
}

function buildRiskEntry(
  customerId: string,
  productId: string,
  purchases: Array<{ purchasedAt: Date; schedule: string | null }>,
): CustomerRefillRisk {
  const sorted = [...purchases].sort((a, b) => a.purchasedAt.getTime() - b.purchasedAt.getTime());
  const lastPurchase = sorted[sorted.length - 1];
  const daysSinceLast = (Date.now() - lastPurchase.purchasedAt.getTime()) / (1000 * 60 * 60 * 24);
  const averageIntervalDays = computeAverageInterval(sorted.map((p) => p.purchasedAt));
  const schedule = purchases[0].schedule;
  const { riskLevel, riskScore, daysUntilRefillDue } = computeRisk(
    sorted.length,
    averageIntervalDays,
    daysSinceLast,
    schedule,
  );
  return {
    customerId,
    productId,
    purchaseCount: sorted.length,
    averageIntervalDays,
    lastPurchaseDaysAgo: daysSinceLast,
    daysUntilRefillDue,
    riskLevel,
    riskScore,
    schedule,
  };
}

function applyFiltersAndLimit(
  results: CustomerRefillRisk[],
  minRiskLevel: RiskLevel | undefined,
  limit: number,
): CustomerRefillRisk[] {
  let filtered = results;
  if (minRiskLevel) {
    const minOrder = RISK_ORDER[minRiskLevel];
    filtered = results.filter((r) => RISK_ORDER[r.riskLevel] >= minOrder);
  }
  filtered.sort((a, b) => b.riskScore - a.riskScore);
  return filtered.slice(0, limit);
}

export async function getCustomerRefillRisks(
  customerId: string,
  options?: { lookbackDays?: number; maxProducts?: number; minRiskLevel?: RiskLevel },
): Promise<CustomerRefillRisk[]> {
  const lookbackDays = options?.lookbackDays ?? ENV.refillRiskLookbackDays;
  const maxProducts = options?.maxProducts ?? 50;
  const db = await getDb();
  if (!db) {
    logger.error({ customerId }, "refillRiskService: DB unavailable");
    return [];
  }

  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      productId: saleLines.productId,
      createdAt: sales.createdAt,
      schedule: saleLines.scheduleCode,
    })
    .from(saleLines)
    .innerJoin(sales, eq(saleLines.saleId, sales.id))
    .where(
      and(
        eq(sales.customerId, customerId),
        eq(sales.status, "confirmed"),
        gte(sales.createdAt, since.getTime()),
      ),
    )
    .orderBy(desc(sales.createdAt));

  if (rows.length === 0) return [];

  const byProduct = new Map<string, Array<{ purchasedAt: Date; schedule: string | null }>>();
  for (const row of rows) {
    const existing = byProduct.get(row.productId) ?? [];
    existing.push({ purchasedAt: new Date(Number(row.createdAt)), schedule: row.schedule });
    byProduct.set(row.productId, existing);
  }

  const results: CustomerRefillRisk[] = [];
  for (const [productId, purchases] of Array.from(byProduct)) {
    results.push(buildRiskEntry(customerId, productId, purchases));
  }

  return applyFiltersAndLimit(results, options?.minRiskLevel, maxProducts);
}

export async function getStoreRefillAlerts(
  storeId: string,
  options?: { lookbackDays?: number; minRiskLevel?: RiskLevel; limit?: number },
): Promise<CustomerRefillRisk[]> {
  const lookbackDays = options?.lookbackDays ?? ENV.refillRiskLookbackDays;
  const limit = options?.limit ?? 100;
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
        gte(sales.createdAt, since.getTime()),
      ),
    );

  const customerRows = rows.filter((r) => r.customerId != null);

  const byKey = new Map<string, Array<{ purchasedAt: Date; schedule: string | null }>>();
  for (const row of customerRows) {
    const key = `${row.customerId}::${row.productId}`;
    const existing = byKey.get(key) ?? [];
    existing.push({ purchasedAt: new Date(Number(row.createdAt)), schedule: row.schedule });
    byKey.set(key, existing);
  }

  const results: CustomerRefillRisk[] = [];
  for (const [key, purchases] of Array.from(byKey)) {
    const [customerId, productId] = key.split("::");
    results.push(buildRiskEntry(customerId, productId, purchases));
  }

  return applyFiltersAndLimit(results, options?.minRiskLevel, limit);
}
