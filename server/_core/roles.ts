// Role type and role-set constants shared by trpc.ts and rbac.ts.
// Extracted here to break the trpc ↔ rbac circular import.

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

/** Any non-customer staff member */
export const STAFF_ROLES: UserRole[] = [
  "admin",
  "super_admin",
  "ops_admin",
  "pharmacist",
  "store_manager",
  "purchase_manager",
  "accountant",
  "cashier",
  "salesman",
  "rider",
  "inventory_operator",
  "delivery_operator",
  "auditor",
];

/** Full admin/owner access */
export const ADMIN_ROLES: UserRole[] = ["admin", "super_admin", "ops_admin"];

/** Can approve / reject prescriptions */
export const PHARMACIST_ROLES: UserRole[] = [
  "pharmacist",
  "admin",
  "super_admin",
  "store_manager",
  "ops_admin",
];

/** Can manage store operations */
export const MANAGER_ROLES: UserRole[] = [
  "store_manager",
  "admin",
  "super_admin",
  "ops_admin",
];

/** Can create / commit purchase invoices */
export const PURCHASE_ROLES: UserRole[] = [
  "purchase_manager",
  "admin",
  "super_admin",
  "store_manager",
  "ops_admin",
];

/** Can advance delivery statuses */
export const RIDER_ROLES: UserRole[] = [
  "rider",
  "delivery_operator",
  "admin",
  "super_admin",
  "ops_admin",
];

export function isStaffRole(role: string | undefined): boolean {
  return STAFF_ROLES.includes((role ?? "") as UserRole);
}

export function isAdminRole(role: string | undefined): boolean {
  return ADMIN_ROLES.includes((role ?? "") as UserRole);
}

export function isCustomerRole(role: string | undefined): boolean {
  return !isStaffRole(role);
}
