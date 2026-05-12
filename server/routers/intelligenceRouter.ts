import { z } from "zod";
import { router, adminProcedure, managerProcedure } from "../_core/trpc";
import {
  buildCustomerContinuityGraph,
  buildProductContinuityGraph,
  identifyContinuityCriticalSkus,
} from "../services/continuityGraph";
import {
  getCustomerRefillRisks,
  getStoreRefillAlerts,
} from "../services/refillRiskService";
import {
  getStockoutForecast,
  getProductStockoutRisk,
} from "../services/stockoutIntelligence";
import { assertPhaseAtLeast } from "../services/featureFlags";

export const intelligenceRouter = router({
  // ─── Continuity graph ────────────────────────────────────────────────────────

  customerContinuityGraph: managerProcedure
    .input(
      z.object({
        customerId: z.string().min(1),
        lookbackDays: z.number().int().min(1).max(730).optional(),
        maxEdges: z.number().int().min(1).max(500).optional(),
      })
    )
    .query(async ({ input }) => {
      assertPhaseAtLeast("scaled", "Intelligence: customerContinuityGraph");
      return buildCustomerContinuityGraph(input.customerId, {
        lookbackDays: input.lookbackDays,
        maxEdges: input.maxEdges,
      });
    }),

  productContinuityGraph: managerProcedure
    .input(
      z.object({
        productId: z.string().min(1),
        storeId: z.string().optional(),
        lookbackDays: z.number().int().min(1).max(730).optional(),
        maxEdges: z.number().int().min(1).max(500).optional(),
      })
    )
    .query(async ({ input }) => {
      assertPhaseAtLeast("scaled", "Intelligence: productContinuityGraph");
      return buildProductContinuityGraph(input.productId, {
        storeId: input.storeId,
        lookbackDays: input.lookbackDays,
        maxEdges: input.maxEdges,
      });
    }),

  continuityCriticalSkus: managerProcedure
    .input(
      z.object({
        storeId: z.string().min(1),
        minCustomersAffected: z.number().int().min(1).optional(),
        minContinuityScore: z.number().min(0).max(1).optional(),
      })
    )
    .query(async ({ input }) => {
      assertPhaseAtLeast("scaled", "Intelligence: continuityCriticalSkus");
      return identifyContinuityCriticalSkus(input.storeId, {
        minCustomersAffected: input.minCustomersAffected,
        minContinuityScore: input.minContinuityScore,
      });
    }),

  // ─── Refill risk ──────────────────────────────────────────────────────────────

  customerRefillRisks: managerProcedure
    .input(
      z.object({
        customerId: z.string().min(1),
        lookbackDays: z.number().int().min(1).max(730).optional(),
        maxProducts: z.number().int().min(1).max(200).optional(),
        minRiskLevel: z.enum(["low", "medium", "high", "critical"]).optional(),
      })
    )
    .query(async ({ input }) => {
      assertPhaseAtLeast("scaled", "Intelligence: customerRefillRisks");
      return getCustomerRefillRisks(input.customerId, {
        lookbackDays: input.lookbackDays,
        maxProducts: input.maxProducts,
        minRiskLevel: input.minRiskLevel,
      });
    }),

  storeRefillAlerts: managerProcedure
    .input(
      z.object({
        storeId: z.string().min(1),
        lookbackDays: z.number().int().min(1).max(730).optional(),
        minRiskLevel: z.enum(["low", "medium", "high", "critical"]).optional(),
        limit: z.number().int().min(1).max(500).optional(),
      })
    )
    .query(async ({ input }) => {
      assertPhaseAtLeast("scaled", "Intelligence: storeRefillAlerts");
      return getStoreRefillAlerts(input.storeId, {
        lookbackDays: input.lookbackDays,
        minRiskLevel: input.minRiskLevel,
        limit: input.limit,
      });
    }),

  // ─── Stockout intelligence ───────────────────────────────────────────────────

  stockoutForecast: managerProcedure
    .input(
      z.object({
        storeId: z.string().min(1),
        numericStoreId: z.number().int().min(1).optional(),
        lookbackDays: z.number().int().min(1).max(730).optional(),
        lookaheadDays: z.number().int().min(1).max(365).optional(),
        limit: z.number().int().min(1).max(500).optional(),
        minRiskLevel: z.enum(["low", "medium", "high", "critical"]).optional(),
      })
    )
    .query(async ({ input }) => {
      assertPhaseAtLeast("scaled", "Intelligence: stockoutForecast");
      return getStockoutForecast(input.storeId, {
        numericStoreId: input.numericStoreId,
        lookbackDays: input.lookbackDays,
        lookaheadDays: input.lookaheadDays,
        limit: input.limit,
        minRiskLevel: input.minRiskLevel,
      });
    }),

  productStockoutRisk: managerProcedure
    .input(
      z.object({
        productId: z.string().min(1),
        storeId: z.string().min(1),
        numericStoreId: z.number().int().min(1).optional(),
        lookbackDays: z.number().int().min(1).max(730).optional(),
        lookaheadDays: z.number().int().min(1).max(365).optional(),
      })
    )
    .query(async ({ input }) => {
      assertPhaseAtLeast("scaled", "Intelligence: productStockoutRisk");
      return getProductStockoutRisk(input.productId, input.storeId, {
        numericStoreId: input.numericStoreId,
        lookbackDays: input.lookbackDays,
        lookaheadDays: input.lookaheadDays,
      });
    }),
});
