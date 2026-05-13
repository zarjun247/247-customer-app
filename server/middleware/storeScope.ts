import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import type { TrpcContext } from "../_core/context";
import { requireStoreAccess } from "../_core/rbac";
import { ENV } from "../_core/env";
import { logger } from "../_core/observability";

async function getDb() {
  const { getDb: _getDb } = await import("../db");
  const db = await _getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "DB unavailable",
    });
  return db;
}

const KNOWN_ENTITY_TYPES = [
  "sale",
  "purchase_invoice",
  "order",
  "stock_audit",
  "batch",
] as const;

async function loadEntityStoreId(
  entityType: string,
  entityId: number
): Promise<number | null> {
  if (!(KNOWN_ENTITY_TYPES as readonly string[]).includes(entityType)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Unknown entityType for store-scope check: ${entityType}`,
    });
  }
  const db = await getDb();
  switch (entityType) {
    case "sale": {
      const { sales } = await import("../../drizzle/schema");
      const [row] = await db
        .select({ storeId: sales.storeId })
        .from(sales)
        .where(eq(sales.id, String(entityId)))
        .limit(1);
      return row?.storeId ? Number(row.storeId) : null;
    }
    case "purchase_invoice": {
      const { purchaseInvoices } = await import("../../drizzle/schema");
      const [row] = await db
        .select({ storeId: purchaseInvoices.storeId })
        .from(purchaseInvoices)
        .where(eq(purchaseInvoices.id, entityId))
        .limit(1);
      return row?.storeId ? Number(row.storeId) : null;
    }
    case "order": {
      const { orders } = await import("../../drizzle/schema");
      const [row] = await db
        .select({ storeId: orders.storeId })
        .from(orders)
        .where(eq(orders.id, entityId))
        .limit(1);
      return row?.storeId ? Number(row.storeId) : null;
    }
    case "stock_audit": {
      const { stockAudits } = await import("../../drizzle/schema");
      const [row] = await db
        .select({ storeId: stockAudits.storeId })
        .from(stockAudits)
        .where(eq(stockAudits.id, entityId))
        .limit(1);
      return row?.storeId ? Number(row.storeId) : null;
    }
    case "batch": {
      const { batchLedger } = await import("../../drizzle/schema");
      const [row] = await db
        .select({ storeId: batchLedger.storeId })
        .from(batchLedger)
        .where(eq(batchLedger.id, entityId))
        .limit(1);
      return row?.storeId ? Number(row.storeId) : null;
    }
    default:
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Unknown entityType for store-scope check: ${entityType}`,
      });
  }
}

/**
 * Entity-derived store-scope guard: loads the entity's storeId from the DB
 * (never trusts input.storeId) and verifies the caller has access.
 * Use for mutate-existing procedures where the entity already exists in the DB.
 */
export async function requireStoreAccessForEntity(
  entityType: string,
  entityId: number,
  ctx: TrpcContext
): Promise<void> {
  const mode = ENV.storeScopeEnforcementMode;
  if (mode === "off") return;

  const entityStoreId = await loadEntityStoreId(entityType, entityId);
  if (entityStoreId === null) {
    if (mode === "enforce")
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `${entityType} ${entityId} not found`,
      });
    logger.warn(
      { entityType, entityId, userId: ctx.user?.id },
      "store-scope: entity not found, skipping check"
    );
    return;
  }

  try {
    requireStoreAccess(ctx.user, entityStoreId);
  } catch (err) {
    if (mode === "log_only") {
      logger.warn(
        {
          entityType,
          entityId,
          entityStoreId,
          userId: ctx.user?.id,
          userStoreId: ctx.user?.staffStoreId,
        },
        "store-scope violation (log_only — not blocking)"
      );
      return;
    }
    throw err;
  }
}

/**
 * Input-derived store-scope guard: verifies the caller has access to the given storeId.
 * Use for filter-list and create-new procedures where storeId comes from input.
 */
export function requireStoreAccessForUserAtStore(
  ctx: TrpcContext,
  storeId: number
): void {
  const mode = ENV.storeScopeEnforcementMode;
  if (mode === "off") return;

  try {
    requireStoreAccess(ctx.user, storeId);
  } catch (err) {
    if (mode === "log_only") {
      logger.warn(
        { storeId, userId: ctx.user?.id, userStoreId: ctx.user?.staffStoreId },
        "store-scope violation (log_only — not blocking)"
      );
      return;
    }
    throw err;
  }
}
