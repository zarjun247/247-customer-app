import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

// ─── Role definitions ─────────────────────────────────────────────────────────
export type UserRole =
  | "user" | "customer" | "admin" | "super_admin"
  | "pharmacist" | "store_manager" | "purchase_manager"
  | "accountant" | "cashier" | "salesman" | "rider"
  | "ops_admin" | "inventory_operator" | "delivery_operator" | "auditor";

export const STAFF_ROLES: UserRole[] = [
  "admin", "super_admin", "pharmacist", "store_manager",
  "purchase_manager", "accountant", "cashier", "salesman",
  "rider", "ops_admin", "inventory_operator", "delivery_operator", "auditor",
];
export const PHARMACIST_ROLES: UserRole[] = ["pharmacist", "admin", "super_admin", "store_manager"];
export const MANAGER_ROLES: UserRole[] = ["store_manager", "admin", "super_admin", "ops_admin"];
export const PURCHASE_ROLES: UserRole[] = ["purchase_manager", "admin", "super_admin", "store_manager"];
export const RIDER_ROLES: UserRole[] = ["rider", "delivery_operator", "admin", "super_admin"];

// ─── Base auth middleware ─────────────────────────────────────────────────────
const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;
    const role = ctx.user?.role as UserRole | undefined;
    if (!ctx.user || !["admin", "super_admin"].includes(role ?? "")) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
);

export const staffProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;
    const role = ctx.user?.role as UserRole | undefined;
    if (!ctx.user || !STAFF_ROLES.includes(role ?? "" as UserRole)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Staff access required" });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
);

export const pharmacistProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;
    const role = ctx.user?.role as UserRole | undefined;
    if (!ctx.user || !PHARMACIST_ROLES.includes(role ?? "" as UserRole)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Pharmacist access required" });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
);

export const managerProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;
    const role = ctx.user?.role as UserRole | undefined;
    if (!ctx.user || !MANAGER_ROLES.includes(role ?? "" as UserRole)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Manager access required" });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
);

// ─── RBAC helper functions ────────────────────────────────────────────────────
export function requireAnyRole(userRole: string | undefined, allowed: UserRole[]): void {
  if (!userRole || !allowed.includes(userRole as UserRole)) {
    throw new TRPCError({ code: "FORBIDDEN", message: `One of [${allowed.join(", ")}] required` });
  }
}

export function requireOrderOwnershipOrStaff(
  userId: number, orderUserId: number, userRole: string | undefined,
): void {
  if (!STAFF_ROLES.includes((userRole ?? "") as UserRole) && userId !== orderUserId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this order" });
  }
}

export function requirePrescriptionOwnershipOrStaff(
  userId: number, prescriptionUserId: number, userRole: string | undefined,
): void {
  if (!STAFF_ROLES.includes((userRole ?? "") as UserRole) && userId !== prescriptionUserId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this prescription" });
  }
}

export function isStaffRole(role: string | undefined): boolean {
  return STAFF_ROLES.includes((role ?? "") as UserRole);
}
