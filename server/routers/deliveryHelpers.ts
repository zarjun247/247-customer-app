/**
 * deliveryHelpers.ts — Shared helpers for delivery routers
 *
 * Extracted from deliveryRouter.ts so they can be used by both
 * deliveryRouter.ts and deliveryTaskRouter.ts without circular imports.
 */

import { TRPCError } from "@trpc/server";
import {
  requireStaffStore,
  requireStoreAccess as _requireStoreAccess,
} from "../_core/rbac";
import type { AccessUser } from "../_core/rbac";
import type { CtxLike } from "../services/audit";
import { eq } from "drizzle-orm";
import { orders, deliveryTasks as _deliveryTasks } from "../../drizzle/schema";
import { logAudit } from "../services/audit";
import { getDb } from "../db";

// ─── Role helpers ─────────────────────────────────────────────────────────────

export const DELIVERY_ROLES = [
  "delivery_operator",
  "store_manager",
  "admin",
] as const;

export const MANAGER_ROLES = ["store_manager", "admin"] as const;

export function assertRole(
  role: string,
  allowed: readonly string[],
  label: string
) {
  if (!allowed.includes(role))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `${label} access required`,
    });
}

export function getStoreId(user: AccessUser): number {
  return requireStaffStore(user);
}

export async function assertRegulatedDeliveryAllowed(
  orderId: number,
  ctx: CtxLike
) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
  const { orderItems, products, prescriptions } = await import(
    "../../drizzle/schema"
  );
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!order) throw new TRPCError({ code: "NOT_FOUND" });
  const lines = await db
    .select({
      schedule: products.schedule,
      requiresPrescription: products.requiresPrescription,
    })
    .from(orderItems)
    .leftJoin(products, eq(orderItems.productId, products.id))
    .where(eq(orderItems.orderId, orderId));
  const regulated = lines.some(
    l =>
      ["H", "H1", "X"].includes(String(l.schedule ?? "")) ||
      Boolean(l.requiresPrescription)
  );
  if (!regulated) return;
  const [rx] = order.prescriptionId
    ? await db
        .select({ status: prescriptions.status })
        .from(prescriptions)
        .where(eq(prescriptions.id, order.prescriptionId))
        .limit(1)
    : [null];
  const rxOk = !!rx && ["approved", "on_file"].includes(String(rx.status));
  if (
    !rxOk ||
    !["picking", "packed", "out_for_delivery"].includes(String(order.status))
  ) {
    await logAudit(
      {
        action: "delivery.regulated_release_blocked",
        entityType: "order",
        entityId: orderId,
        afterJson: { rxOk, status: order.status },
      },
      ctx
    );
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Regulated delivery requires approved prescription and pharmacist clearance",
    });
  }
  await logAudit(
    {
      action: "delivery.regulated_release_allowed",
      entityType: "order",
      entityId: orderId,
      afterJson: { rxOk, status: order.status },
    },
    ctx
  );
}
