/**
 * inventoryHelpers.ts — Shared helpers for inventory routers
 *
 * Extracted from inventoryRouter.ts so they can be used by both
 * inventoryRouter.ts and inventoryBatchRouter.ts without circular imports.
 */

import { TRPCError } from "@trpc/server";
import {
  isAdmin,
  isSuperAdmin,
  requireStaffStore,
  requireStoreAccess,
  type AccessUser,
} from "../_core/rbac";

// ─── DB helper ────────────────────────────────────────────────────────────────

export async function getDb() {
  const { getDb: _getDb } = await import("../db");
  const db = await _getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "DB unavailable",
    });
  return db;
}

// ─── Schema helper ────────────────────────────────────────────────────────────

export async function schema() {
  return import("../../drizzle/schema");
}

// ─── Role guards ──────────────────────────────────────────────────────────────

export function assertInventoryRole(role: string | null | undefined) {
  const allowed = [
    "admin",
    "super_admin",
    "store_manager",
    "inventory_operator",
    "pharmacist",
    "purchase_manager",
  ];
  if (!role || !allowed.includes(role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Inventory operator or manager role required",
    });
  }
}

export function assertManagerRole(role: string | null | undefined) {
  const allowed = ["admin", "super_admin", "store_manager", "purchase_manager"];
  if (!role || !allowed.includes(role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Store manager or admin role required",
    });
  }
}

export function requireStoreScopedFilter(
  user: AccessUser | null | undefined,
  requestedStoreId?: number
): number | undefined {
  if (requestedStoreId !== undefined) {
    requireStoreAccess(user, requestedStoreId, { allowAdminCrossStore: true });
    return requestedStoreId;
  }
  if (isSuperAdmin(user) || isAdmin(user)) return undefined;
  return requireStaffStore(user);
}

export function _requireTransferEndpointAccess(
  user: AccessUser | null | undefined,
  transfer: { fromStoreId: number; toStoreId: number },
  endpoint: "initiate" | "receive" | "read"
): void {
  if (isSuperAdmin(user) || isAdmin(user)) return;
  const staffStoreId = requireStaffStore(user);
  if (endpoint === "initiate" && staffStoreId === transfer.fromStoreId) return;
  if (endpoint === "receive" && staffStoreId === transfer.toStoreId) return;
  if (
    endpoint === "read" &&
    (staffStoreId === transfer.fromStoreId ||
      staffStoreId === transfer.toStoreId)
  )
    return;
  throw new TRPCError({
    code: "FORBIDDEN",
    message: "Store-scope transfer access denied",
  });
}

// ─── Expiry bucket ────────────────────────────────────────────────────────────

export function computeExpiryBucket(
  expiryDate: string | Date
): "normal" | "warning" | "critical" | "quarantine_candidate" | "expired" {
  const expiry = new Date(expiryDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.floor((expiry.getTime() - today.getTime()) / 86400000);
  if (days <= 0) return "expired";
  if (days <= 30) return "quarantine_candidate";
  if (days <= 60) return "critical";
  if (days <= 90) return "warning";
  return "normal";
}
