import { TRPCError } from "@trpc/server";
import type { User } from "../../drizzle/schema";
import { isStaffRole, isAdminRole } from "./trpc";

export type AccessUser = Pick<User, "id" | "role" | "staffStoreId">;

export function isSuperAdmin(user: AccessUser | null | undefined): boolean {
  return user?.role === "super_admin";
}
export function isAdmin(user: AccessUser | null | undefined): boolean {
  return !!user?.role && isAdminRole(user.role);
}
export function isStaff(user: AccessUser | null | undefined): boolean {
  return !!user?.role && isStaffRole(user.role);
}
export function getUserStoreId(
  user: AccessUser | null | undefined
): number | null {
  return user?.staffStoreId ?? null;
}

export function requireStaffStore(user: AccessUser | null | undefined): number {
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED" });
  if (!isStaff(user))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Staff access required",
    });
  if (!user.staffStoreId)
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Staff store assignment required",
    });
  return user.staffStoreId;
}

export function assertCanCrossStore(user: AccessUser | null | undefined): void {
  if (!isSuperAdmin(user))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Cross-store access requires super_admin",
    });
}

export function requireStoreAccess(
  user: AccessUser | null | undefined,
  targetStoreId: number,
  opts?: { allowAdminCrossStore?: boolean }
): void {
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED" });
  if (isSuperAdmin(user)) return;
  if (opts?.allowAdminCrossStore && isAdmin(user)) return;
  const storeId = requireStaffStore(user);
  if (storeId !== targetStoreId)
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Store-scope access denied",
    });
}

export const requireSameStoreOrSuperAdmin = requireStoreAccess;
export const assertCanReadStoreResource = requireStoreAccess;
export const assertCanMutateStoreResource = requireStoreAccess;

export function requireCustomerOwnsResource(
  user: AccessUser | null | undefined,
  resourceUserId: number
): void {
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED" });
  if (isStaff(user)) return;
  if (user.id !== resourceUserId)
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Resource ownership required",
    });
}

export function requireOrderAccess(
  user: AccessUser | null | undefined,
  order: { userId?: number | null; storeId?: number | null }
): void {
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED" });
  if (isStaff(user) && order.storeId)
    return requireStoreAccess(user, order.storeId);
  return requireCustomerOwnsResource(user, order.userId ?? -1);
}

export function requirePrescriptionAccess(
  user: AccessUser | null | undefined,
  prescription: { userId?: number | null; storeId?: number | null }
): void {
  return requireOrderAccess(user, prescription);
}
