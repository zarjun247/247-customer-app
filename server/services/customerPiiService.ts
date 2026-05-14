import { createHmac } from "crypto";
import { encrypt, decrypt, getMasterKey } from "./piiEncryption";

// Transparent PII encrypt/decrypt for user fields.
// In passthrough mode (no master key + not production), these are identity functions.

export async function encryptUserPhone(
  phone: string | null | undefined
): Promise<string | null> {
  if (!phone) return phone ?? null;
  return encrypt(phone, "customer.phone");
}

export async function decryptUserPhone(
  stored: string | null | undefined
): Promise<string | null> {
  if (!stored) return stored ?? null;
  return decrypt(stored, "customer.phone");
}

export async function encryptUserEmail(
  email: string | null | undefined
): Promise<string | null> {
  if (!email) return email ?? null;
  return encrypt(email, "customer.email");
}

export async function decryptUserEmail(
  stored: string | null | undefined
): Promise<string | null> {
  if (!stored) return stored ?? null;
  return decrypt(stored, "customer.email");
}

/**
 * Compute a deterministic HMAC-SHA256 hash of a phone number for indexed lookup.
 *
 * When PII_ENCRYPTION_MASTER_KEY is set (production), phone values are stored
 * as AES-GCM ciphertexts with a random IV — non-deterministic, cannot be searched.
 * This hash uses the same master key (first 32 bytes) as the HMAC secret so we
 * don't introduce a second secret, while still being distinct from the encryption
 * (HMAC ≠ encryption and doesn't leak the plaintext).
 *
 * Returns null when no master key is configured — in that mode phones are stored
 * as plaintext and the direct eq() lookup in getUserByPhone still works.
 */
export function computePhoneHash(phone: string): string | null {
  const masterKey = getMasterKey();
  if (!masterKey) return null;
  return createHmac("sha256", masterKey).update(phone, "utf8").digest("hex");
}

export type UserPiiFields = {
  phone?: string | null;
  email?: string | null;
};

export async function encryptUserPii<T extends UserPiiFields>(
  user: T
): Promise<T> {
  return {
    ...user,
    phone: user.phone != null ? await encryptUserPhone(user.phone) : user.phone,
    email: user.email != null ? await encryptUserEmail(user.email) : user.email,
  };
}

export async function decryptUserPii<T extends UserPiiFields>(
  user: T
): Promise<T> {
  return {
    ...user,
    phone: user.phone != null ? await decryptUserPhone(user.phone) : user.phone,
    email: user.email != null ? await decryptUserEmail(user.email) : user.email,
  };
}
