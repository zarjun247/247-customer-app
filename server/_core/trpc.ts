import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { requireStaffStore } from './rbac';


const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

// ─── Role definitions ─────────────────────────────────────────────────────────
// Matches DB enum in drizzle/schema.ts exactly (15 values)
export type UserRole =
  | "user"
  | "customer"
  | "admin"
  | "super_admin"
  | "ops_admin"
  | "pharmacist"
  | "store_manager"
  | "purchase_manager"
  | "accountant"
  | "cashier"
  | "salesman"
  | "rider"
  | "inventory_operator"
  | "delivery_operator"
  | "auditor";

// ─── Role sets ────────────────────────────────────────────────────────────────

/** Any non-customer staff member */
export const STAFF_ROLES: UserRole[] = [
  "admin", "super_admin", "ops_admin",
  "pharmacist", "store_manager",
  "purchase_manager", "accountant",
  "cashier", "salesman",
  "rider", "inventory_operator", "delivery_operator", "auditor",
];

/** Full admin/owner access */
export const ADMIN_ROLES: UserRole[] = ["admin", "super_admin", "ops_admin"];

/** Can approve / reject prescriptions */
export const PHARMACIST_ROLES: UserRole[] = [
  "pharmacist", "admin", "super_admin", "store_manager", "ops_admin",
];

/** Can manage store operations */
export const MANAGER_ROLES: UserRole[] = [
  "store_manager", "admin", "super_admin", "ops_admin",
];

/** Can create / commit purchase invoices */
export const PURCHASE_ROLES: UserRole[] = [
  "purchase_manager", "admin", "super_admin", "store_manager", "ops_admin",
];

/** Can advance delivery statuses */
export const RIDER_ROLES: UserRole[] = [
  "rider", "delivery_operator", "admin", "super_admin", "ops_admin",
];

// ─── Base auth middleware ─────────────────────────────────────────────────────
const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

// ─── Procedure factories ──────────────────────────────────────────────────────

/** Any authenticated user */
export const protectedProcedure = t.procedure.use(requireUser);

/** Admin / super_admin / ops_admin only */
export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;
    const role = ctx.user?.role as UserRole | undefined;
    if (!ctx.user || !ADMIN_ROLES.includes(role ?? "" as UserRole)) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
);

/** Any staff role */
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

/** Pharmacist-level access */
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

/** Manager-level access */
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

/** Purchase manager access */
export const purchaseProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;
    const role = ctx.user?.role as UserRole | undefined;
    if (!ctx.user || !PURCHASE_ROLES.includes(role ?? "" as UserRole)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Purchase manager access required" });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
);

/** Rider / delivery access */
export const riderProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;
    const role = ctx.user?.role as UserRole | undefined;
    if (!ctx.user || !RIDER_ROLES.includes(role ?? "" as UserRole)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Rider access required" });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
);



/** Store-scoped staff access (fails closed without staffStoreId) */
export const storeStaffProcedure = staffProcedure.use(
  t.middleware(async ({ ctx, next }) => {
    requireStaffStore(ctx.user);
    return next();
  }),
);

export const storeManagerProcedure = managerProcedure.use(t.middleware(async ({ ctx, next }) => { requireStaffStore(ctx.user); return next(); }));
export const storePharmacistProcedure = pharmacistProcedure.use(t.middleware(async ({ ctx, next }) => { requireStaffStore(ctx.user); return next(); }));
export const storePurchaseProcedure = purchaseProcedure.use(t.middleware(async ({ ctx, next }) => { requireStaffStore(ctx.user); return next(); }));
export const storeRiderProcedure = riderProcedure.use(t.middleware(async ({ ctx, next }) => { requireStaffStore(ctx.user); return next(); }));

export const superAdminProcedure = t.procedure.use(
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.user || ctx.user.role !== 'super_admin') throw new TRPCError({ code: 'FORBIDDEN', message: 'Super admin access required' });
    return next();
  }),
);

// ─── Standalone RBAC guard functions ─────────────────────────────────────────
// Call these inside procedure bodies for fine-grained inline checks.

/** Require exactly one specific role */
export function requireRole(userRole: string | undefined, role: UserRole): void {
  if (!userRole || userRole !== role) {
    throw new TRPCError({ code: "FORBIDDEN", message: `Role '${role}' required` });
  }
}

/** Require any one of the listed roles */
export function requireAnyRole(userRole: string | undefined, allowed: UserRole[]): void {
  if (!userRole || !allowed.includes(userRole as UserRole)) {
    throw new TRPCError({ code: "FORBIDDEN", message: `One of [${allowed.join(", ")}] required` });
  }
}

/** Require any staff role (not customer/user) */
export function requireStaff(userRole: string | undefined): void {
  requireAnyRole(userRole, STAFF_ROLES);
}

/** Require admin or super_admin or ops_admin */
export function requireAdmin(userRole: string | undefined): void {
  requireAnyRole(userRole, ADMIN_ROLES);
}

/** Require pharmacist-level access */
export function requirePharmacist(userRole: string | undefined): void {
  requireAnyRole(userRole, PHARMACIST_ROLES);
}

/** Require manager-level access */
export function requireManager(userRole: string | undefined): void {
  requireAnyRole(userRole, MANAGER_ROLES);
}

/** Require rider-level access */
export function requireRider(userRole: string | undefined): void {
  requireAnyRole(userRole, RIDER_ROLES);
}

/**
 * Require that the caller either owns the order OR is staff.
 * Customers can only access their own orders.
 */
export function requireOrderOwnershipOrStaff(
  userId: number,
  orderUserId: number,
  userRole: string | undefined,
): void {
  if (!isStaffRole(userRole) && userId !== orderUserId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this order" });
  }
}

/**
 * Require that the caller either owns the prescription OR is staff.
 */
export function requirePrescriptionOwnershipOrStaff(
  userId: number,
  prescriptionUserId: number,
  userRole: string | undefined,
): void {
  if (!isStaffRole(userRole) && userId !== prescriptionUserId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this prescription" });
  }
}

// ─── Boolean helpers ──────────────────────────────────────────────────────────

/** Is this role a staff role? */
export function isStaffRole(role: string | undefined): boolean {
  return STAFF_ROLES.includes((role ?? "") as UserRole);
}

/** Is this role an admin role? */
export function isAdminRole(role: string | undefined): boolean {
  return ADMIN_ROLES.includes((role ?? "") as UserRole);
}

/** Is this role a customer/user (non-staff)? */
export function isCustomerRole(role: string | undefined): boolean {
  return !isStaffRole(role);
}
