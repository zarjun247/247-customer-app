/**
 * masterDataUtils.ts
 * Shared helpers for master data routers.
 */
import { TRPCError } from "@trpc/server";

export type StaffRole =
  | "admin"
  | "super_admin"
  | "store_manager"
  | "pharmacist"
  | "purchase_manager"
  | "accountant"
  | "cashier"
  | "salesman"
  | "inventory_operator"
  | "delivery_operator"
  | "auditor";

export const STAFF_ROLES: StaffRole[] = [
  "admin",
  "super_admin",
  "store_manager",
  "pharmacist",
  "purchase_manager",
  "accountant",
  "cashier",
  "salesman",
  "inventory_operator",
  "delivery_operator",
  "auditor",
];

export function requireStaff(role: string) {
  if (!STAFF_ROLES.includes(role as StaffRole)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Staff access required.",
    });
  }
}

export function requireManager(role: string) {
  if (
    !["admin", "super_admin", "store_manager", "purchase_manager"].includes(
      role
    )
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Manager access required.",
    });
  }
}

export async function getDbSafe() {
  const { getDb } = await import("../db");
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "DB unavailable",
    });
  return db;
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown): string => {
    let s: string;
    if (v === null || v === undefined) {
      s = "";
    } else if (typeof v === "object") {
      s = JSON.stringify(v);
    } else {
      const prim = v as string | number | boolean | bigint;
      s = String(prim);
    }
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  return [
    headers.join(","),
    ...rows.map(r => headers.map(h => escape(r[h])).join(",")),
  ].join("\n");
}
