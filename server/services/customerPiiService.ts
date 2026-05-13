import { encrypt, decrypt } from "./piiEncryption";

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
