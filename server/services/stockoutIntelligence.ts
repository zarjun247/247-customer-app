import { and, eq, gte, sql } from "drizzle-orm";
import pino from "pino";
import { getDb } from "../db";
import { sales, saleLines, storeSkus } from "../../drizzle/schema";
import { ENV } from "../_core/env";

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });

export type StockoutRiskLevel = "low" | "medium" | "high" | "critical";

export type StockoutRisk = {
  productId: string;
  storeId: string;
  currentSellable: number;
  averageDailyDemand: number;
  daysToStockout: number;
  riskLevel: StockoutRiskLevel;
  riskScore: number;
  forecastedStockoutDate: Date | null;
};

function classifyRisk(daysToStockout: number, lookaheadDays: number): { riskLevel: StockoutRiskLevel; riskScore: number } {
  if (daysToStockout < 3) return { riskLevel: "critical", riskScore: 1.0 };
  if (daysToStockout < 7) return { riskLevel: "high", riskScore: 0.75 };
  if (daysToStockout < lookaheadDays) return { riskLevel: "medium", riskScore: 0.5 };
  return { riskLevel: "low", riskScore: 0.2 };
}

function buildStockoutRisk(
  productId: string,
  storeId: string,
  currentSellable: number,
  totalQtySold: number,
  lookbackDays: number,
  lookaheadDays: number,
): StockoutRisk {
  const averageDailyDemand = lookbackDays > 0 ? totalQtySold / lookbackDays : 0;
  let daysToStockout: number;
  if (averageDailyDemand <= 0) {
    daysToStockout = Infinity;
  } else {
    daysToStockout = currentSellable / averageDailyDemand;
  }

  const { riskLevel, riskScore } = classifyRisk(daysToStockout, lookaheadDays);
  const forecastedStockoutDate =
    isFinite(daysToStockout) && daysToStockout >= 0
      ? new Date(Date.now() + daysToStockout * 24 * 60 * 60 * 1000)
      : null;

  return {
    productId,
    storeId,
    currentSellable,
    averageDailyDemand,
    daysToStockout: isFinite(daysToStockout) ? daysToStockout : -1,
    riskLevel,
    riskScore,
    forecastedStockoutDate,
  };
}

export async function getStockoutForecast(
  storeId: string,
  options?: {
    numericStoreId?: number;
    lookbackDays?: number;
    lookaheadDays?: number;
    limit?: number;
    minRiskLevel?: StockoutRiskLevel;
  },
): Promise<StockoutRisk[]> {
  const lookbackDays = options?.lookbackDays ?? ENV.refillRiskLookbackDays;
  const lookaheadDays = options?.lookaheadDays ?? ENV.stockoutLookaheadDays;
  const limit = options?.limit ?? 100;
  const db = await getDb();
  if (!db) {
    logger.error({ storeId }, "stockoutIntelligence: DB unavailable");
    return [];
  }

  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  // Query demand from sales history
  const demandRows = await db
    .select({
      productId: saleLines.productId,
      totalQty: sql<number>`SUM(${saleLines.qty})`,
    })
    .from(saleLines)
    .innerJoin(sales, eq(saleLines.saleId, sales.id))
    .where(
      and(
        eq(sales.storeId, storeId),
        eq(sales.status, "confirmed"),
        gte(sales.createdAt, since.getTime()),
      ),
    )
    .groupBy(saleLines.productId);

  if (demandRows.length === 0) return [];

  // Query current stock if numericStoreId provided
  const stockByProductId = new Map<string, number>();
  if (options?.numericStoreId !== undefined) {
    const stockRows = await db
      .select({
        productId: storeSkus.productId,
        stockQty: storeSkus.stockQty,
        softLockedQty: storeSkus.softLockedQty,
      })
      .from(storeSkus)
      .where(
        and(
          eq(storeSkus.storeId, options.numericStoreId),
          eq(storeSkus.isActive, true),
        ),
      );

    for (const row of stockRows) {
      const sellable = Math.max(0, row.stockQty - row.softLockedQty);
      stockByProductId.set(String(row.productId), sellable);
    }
  }

  const RISK_ORDER: Record<StockoutRiskLevel, number> = { critical: 4, high: 3, medium: 2, low: 1 };

  const results: StockoutRisk[] = [];
  for (const row of demandRows) {
    const totalQty = Number(row.totalQty);
    if (totalQty <= 0) continue;

    const currentSellable = stockByProductId.get(String(row.productId)) ?? 0;
    const risk = buildStockoutRisk(
      String(row.productId),
      storeId,
      currentSellable,
      totalQty,
      lookbackDays,
      lookaheadDays,
    );
    results.push(risk);
  }

  let filtered = results;
  if (options?.minRiskLevel) {
    const minOrder = RISK_ORDER[options.minRiskLevel];
    filtered = results.filter((r) => RISK_ORDER[r.riskLevel] >= minOrder);
  }

  filtered.sort((a, b) => b.riskScore - a.riskScore || a.daysToStockout - b.daysToStockout);
  return filtered.slice(0, limit);
}

export async function getProductStockoutRisk(
  productId: string,
  storeId: string,
  options?: {
    numericStoreId?: number;
    lookbackDays?: number;
    lookaheadDays?: number;
  },
): Promise<StockoutRisk | null> {
  const lookbackDays = options?.lookbackDays ?? ENV.refillRiskLookbackDays;
  const lookaheadDays = options?.lookaheadDays ?? ENV.stockoutLookaheadDays;
  const db = await getDb();
  if (!db) return null;

  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  const demandRows = await db
    .select({
      totalQty: sql<number>`SUM(${saleLines.qty})`,
    })
    .from(saleLines)
    .innerJoin(sales, eq(saleLines.saleId, sales.id))
    .where(
      and(
        eq(saleLines.productId, productId),
        eq(sales.storeId, storeId),
        eq(sales.status, "confirmed"),
        gte(sales.createdAt, since.getTime()),
      ),
    );

  const totalQty = Number(demandRows[0]?.totalQty ?? 0);

  let currentSellable = 0;
  if (options?.numericStoreId !== undefined) {
    const stockRows = await db
      .select({ stockQty: storeSkus.stockQty, softLockedQty: storeSkus.softLockedQty })
      .from(storeSkus)
      .where(
        and(
          eq(storeSkus.storeId, options.numericStoreId),
          eq(storeSkus.isActive, true),
          sql`CAST(${storeSkus.productId} AS CHAR) = ${productId}`,
        ),
      );
    if (stockRows.length > 0) {
      currentSellable = Math.max(0, stockRows[0].stockQty - stockRows[0].softLockedQty);
    }
  }

  return buildStockoutRisk(productId, storeId, currentSellable, totalQty, lookbackDays, lookaheadDays);
}
