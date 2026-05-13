import { isStaffRole } from "./roles";

const ALLOWED_PREFIXES = [
  "prescriptions/",
  "invoices/",
  "reports/",
  "product-images/",
  "uploads/",
];
const SENSITIVE_PREFIXES = ["prescriptions/", "invoices/", "reports/"];

export function assertSafeStorageKey(key: string): void {
  if (!key || key.includes("..") || key.includes("\\") || key.startsWith("/"))
    throw new Error("unsafe key");
  if (!ALLOWED_PREFIXES.some(p => key.startsWith(p)))
    throw new Error("prefix not allowed");
  if (!/^[a-zA-Z0-9/_\-.]+$/.test(key)) throw new Error("invalid key format");
}

export function isSensitiveStorageKey(key: string): boolean {
  return SENSITIVE_PREFIXES.some(p => key.startsWith(p));
}

export function canAccessStorageKey(
  user: { id: number; role?: string } | null,
  key: string
): boolean {
  if (!isSensitiveStorageKey(key)) return true;
  if (!user) return false;
  return isStaffRole(user.role) || key.includes(`/user-${user.id}/`);
}
