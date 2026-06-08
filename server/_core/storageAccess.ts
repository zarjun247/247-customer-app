import { isStaffRole } from "./roles";

// All approved storage prefixes. Every storagePut() key must start with one of these.
// Adding a new prefix here requires a corresponding access-control decision in
// SENSITIVE_PREFIXES and canAccessStorageKey().
const ALLOWED_PREFIXES = [
  "prescriptions/",
  "invoices/",
  "reports/",
  "product-images/",
  "uploads/",
  "ingestion/",
  "whatsapp-rx/",
  "whatsapp-bill/",
  "generated/",
];

// Prefixes whose objects require authenticated access (owner, staff, or admin).
const SENSITIVE_PREFIXES = [
  "prescriptions/",
  "invoices/",
  "reports/",
  "whatsapp-rx/",
  "whatsapp-bill/",
];

/**
 * Validates an object storage key before any write or read operation.
 *
 * Rejects:
 *   - empty keys
 *   - path traversal: ".." segments
 *   - backslash traversal
 *   - URL-encoded traversal: %2e%2e, %2f, %5c, %00 etc.
 *   - absolute paths (leading "/")
 *   - control characters (0x00–0x1f, 0x7f)
 *   - keys not under an approved prefix
 *   - characters outside [a-zA-Z0-9/_\-.] (no spaces, no special chars)
 *
 * Throws an Error with a safe message (no key material in message).
 */
export function assertSafeStorageKey(key: string): void {
  if (!key) throw new Error("storage key must not be empty");

  // Reject absolute paths
  if (key.startsWith("/")) throw new Error("storage key must not be absolute");

  // Reject backslashes (Windows-style traversal)
  if (key.includes("\\")) throw new Error("storage key contains backslash");

  // Reject dot-dot traversal (plain and after normalization)
  if (key.includes("..")) throw new Error("storage key contains traversal");

  // Reject URL-encoded traversal sequences: %2e%2e, %2f, %5c, %00, etc.
  // We decode once and check again — double-encoding is also caught by the
  // character-allowlist check below.
  const decoded = decodeURIComponent(key.replace(/\+/g, " "));
  if (decoded !== key) {
    // Key contained percent-encoded characters — reject entirely.
    // Object keys must be pre-normalized plain strings.
    throw new Error("storage key must not contain percent-encoded characters");
  }

  // Reject control characters (0x00–0x1f, 0x7f)
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(key))
    throw new Error("storage key contains control characters");

  // Allowlist: only safe characters
  if (!/^[a-zA-Z0-9/_\-.]+$/.test(key))
    throw new Error("storage key contains disallowed characters");

  // Prefix policy: key must be under an approved prefix
  if (!ALLOWED_PREFIXES.some(p => key.startsWith(p)))
    throw new Error("storage key prefix not allowed");
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
  // Staff/pharmacist/admin can access all sensitive files.
  // Customers can only access their own files (key contains /user-{id}/).
  return isStaffRole(user.role) || key.includes(`/user-${user.id}/`);
}
