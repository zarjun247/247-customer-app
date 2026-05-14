/**
 * salesUtils.ts — shared helpers for salesRouter and salesReportsRouter
 */
import { TRPCError } from "@trpc/server";

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

export function requireSales(role: string | null | undefined) {
  const allowed = [
    "admin",
    "super_admin",
    "store_manager",
    "pharmacist",
    "salesman",
    "cashier",
  ];
  if (!role || !allowed.includes(role))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Sales access required",
    });
}

export function requireManager(role: string | null | undefined) {
  const allowed = ["admin", "super_admin", "store_manager"];
  if (!role || !allowed.includes(role))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Manager role required",
    });
}
