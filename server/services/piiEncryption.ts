import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { randomUUID } from "crypto";
import pino from "pino";
import { eq, and, isNull, desc } from "drizzle-orm";
import { getDb } from "../db";
import { piiEncryptionKeys } from "../../drizzle/schema";

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const DATA_KEY_LENGTH = 32;
// IV_LENGTH bytes for wrapping IV + AUTH_TAG_LENGTH bytes for wrapping tag
const WRAP_OVERHEAD = IV_LENGTH + AUTH_TAG_LENGTH;

export class MasterKeyNotConfiguredError extends Error {
  constructor() {
    super(
      "PII_ENCRYPTION_MASTER_KEY not configured. Production requires it; dev/test may operate in passthrough mode."
    );
    this.name = "MasterKeyNotConfiguredError";
  }
}

export class DecryptionFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DecryptionFailedError";
  }
}

// ─── Master key helpers ───────────────────────────────────────────────────────

export function getMasterKey(): Buffer | null {
  const raw = (process.env.PII_ENCRYPTION_MASTER_KEY ?? "").trim();
  if (!raw) return null;
  try {
    const buf = Buffer.from(raw, "base64");
    if (buf.length !== 32) return null;
    return buf;
  } catch {
    return null;
  }
}

// ─── Data-key envelope encryption ────────────────────────────────────────────

function wrapDataKey(dataKey: Buffer, masterKey: Buffer): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, masterKey, iv);
  const encrypted = Buffer.concat([cipher.update(dataKey), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]);
}

function unwrapDataKey(wrapped: Buffer, masterKey: Buffer): Buffer {
  if (wrapped.length < WRAP_OVERHEAD) {
    throw new DecryptionFailedError("Wrapped key too short");
  }
  const iv = wrapped.subarray(0, IV_LENGTH);
  const authTag = wrapped.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = wrapped.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, masterKey, iv);
  decipher.setAuthTag(authTag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new DecryptionFailedError(
      "Master key unwrap failed — wrong key or tampered data"
    );
  }
}

// ─── Per-scope data key management ───────────────────────────────────────────

const warnedScopes = new Set<string>();

async function getOrCreateDataKey(
  scope: string,
  masterKey: Buffer
): Promise<{ dataKey: Buffer; keyVersion: number }> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable for PII key management");

  const [existing] = await db
    .select()
    .from(piiEncryptionKeys)
    .where(
      and(
        eq(piiEncryptionKeys.scope, scope),
        isNull(piiEncryptionKeys.retiredAt)
      )
    )
    .orderBy(desc(piiEncryptionKeys.keyVersion))
    .limit(1);

  if (existing) {
    const wrapped = Buffer.from(existing.wrappedDataKey, "base64");
    const dataKey = unwrapDataKey(wrapped, masterKey);
    return { dataKey, keyVersion: existing.keyVersion };
  }

  // First use — generate a new data key for this scope
  const dataKey = randomBytes(DATA_KEY_LENGTH);
  const wrapped = wrapDataKey(dataKey, masterKey);
  const id = randomUUID();

  await db.insert(piiEncryptionKeys).values({
    id,
    keyVersion: 1,
    scope,
    wrappedDataKey: wrapped.toString("base64"),
    algorithm: ALGORITHM,
    rotatedFromId: null,
    retiredAt: null,
  });

  return { dataKey, keyVersion: 1 };
}

async function getDataKeyByVersion(
  scope: string,
  keyVersion: number,
  masterKey: Buffer
): Promise<{ dataKey: Buffer; retired: boolean }> {
  const db = await getDb();
  if (!db) throw new DecryptionFailedError("DB unavailable for PII key lookup");

  const [row] = await db
    .select()
    .from(piiEncryptionKeys)
    .where(
      and(
        eq(piiEncryptionKeys.scope, scope),
        eq(piiEncryptionKeys.keyVersion, keyVersion)
      )
    )
    .limit(1);

  if (!row) {
    throw new DecryptionFailedError(
      `No encryption key found for scope=${scope}, version=${keyVersion}`
    );
  }

  const wrapped = Buffer.from(row.wrappedDataKey, "base64");
  const dataKey = unwrapDataKey(wrapped, masterKey);
  return { dataKey, retired: row.retiredAt !== null };
}

// ─── Public encrypt / decrypt API ────────────────────────────────────────────

export async function encrypt(
  plaintext: string,
  scope: string
): Promise<string> {
  const masterKey = getMasterKey();

  if (!masterKey) {
    if (process.env.NODE_ENV === "production") {
      throw new MasterKeyNotConfiguredError();
    }
    if (!warnedScopes.has(scope)) {
      logger.warn({
        scope,
        msg: "piiEncryption: PII_ENCRYPTION_MASTER_KEY not set; running in passthrough mode (dev/test only)",
      });
      warnedScopes.add(scope);
    }
    return plaintext;
  }

  const { dataKey, keyVersion } = await getOrCreateDataKey(scope, masterKey);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, dataKey, iv);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(plaintext, "utf8")),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    "v1",
    keyVersion,
    iv.toString("base64"),
    ciphertext.toString("base64"),
    authTag.toString("base64"),
  ].join(":");
}

export async function decrypt(
  ciphertext: string,
  scope: string
): Promise<string> {
  if (!ciphertext.startsWith("v1:")) {
    // Passthrough mode or legacy plaintext — return as-is
    return ciphertext;
  }

  const masterKey = getMasterKey();
  if (!masterKey) {
    if (process.env.NODE_ENV === "production") {
      throw new MasterKeyNotConfiguredError();
    }
    return ciphertext;
  }

  const parts = ciphertext.split(":");
  if (parts.length !== 5) {
    throw new DecryptionFailedError(
      "Malformed ciphertext format: expected v1:<keyVersion>:<iv>:<ct>:<authTag>"
    );
  }

  const [, keyVersionStr, ivB64, ctB64, authTagB64] = parts;
  const keyVersion = parseInt(keyVersionStr, 10);
  if (!Number.isFinite(keyVersion) || keyVersion < 1) {
    throw new DecryptionFailedError(`Invalid key version: ${keyVersionStr}`);
  }

  const { dataKey, retired } = await getDataKeyByVersion(
    scope,
    keyVersion,
    masterKey
  );

  if (retired) {
    logger.warn({
      scope,
      keyVersion,
      msg: "piiEncryption: decrypting with retired key — row should be re-encrypted after key rotation",
    });
  }

  try {
    const iv = Buffer.from(ivB64, "base64");
    const ct = Buffer.from(ctB64, "base64");
    const authTag = Buffer.from(authTagB64, "base64");
    const decipher = createDecipheriv(ALGORITHM, dataKey, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ct), decipher.final()]);
    return plaintext.toString("utf8");
  } catch {
    throw new DecryptionFailedError(
      "Decryption failed — ciphertext may be tampered or key mismatch"
    );
  }
}

export async function rotateKey(
  scope: string
): Promise<{ newKeyVersion: number; oldKeyVersion: number | null }> {
  const masterKey = getMasterKey();
  if (!masterKey) throw new MasterKeyNotConfiguredError();

  const db = await getDb();
  if (!db) throw new Error("DB unavailable for key rotation");

  const [currentKey] = await db
    .select()
    .from(piiEncryptionKeys)
    .where(
      and(
        eq(piiEncryptionKeys.scope, scope),
        isNull(piiEncryptionKeys.retiredAt)
      )
    )
    .orderBy(desc(piiEncryptionKeys.keyVersion))
    .limit(1);

  const oldKeyVersion = currentKey?.keyVersion ?? null;
  const newKeyVersion = (oldKeyVersion ?? 0) + 1;
  const newDataKey = randomBytes(DATA_KEY_LENGTH);
  const wrapped = wrapDataKey(newDataKey, masterKey);
  const id = randomUUID();

  await db.insert(piiEncryptionKeys).values({
    id,
    keyVersion: newKeyVersion,
    scope,
    wrappedDataKey: wrapped.toString("base64"),
    algorithm: ALGORITHM,
    rotatedFromId: currentKey?.id ?? null,
    retiredAt: null,
  });

  if (currentKey) {
    await db
      .update(piiEncryptionKeys)
      .set({ retiredAt: new Date() })
      .where(eq(piiEncryptionKeys.id, currentKey.id));
  }

  return { newKeyVersion, oldKeyVersion };
}

export async function getKeyStatus(): Promise<
  Array<{
    scope: string;
    activeKeyVersion: number | null;
    totalKeys: number;
    oldestKey: Date | null;
    retiredKeys: number;
  }>
> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select()
    .from(piiEncryptionKeys)
    .orderBy(piiEncryptionKeys.scope, piiEncryptionKeys.keyVersion)
    .limit(10_000);

  const byScope = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!byScope.has(row.scope)) byScope.set(row.scope, []);
    byScope.get(row.scope)!.push(row);
  }

  return Array.from(byScope.entries()).map(([scope, scopeRows]) => {
    const active = scopeRows.find(r => r.retiredAt === null);
    const retired = scopeRows.filter(r => r.retiredAt !== null).length;
    const oldest = scopeRows[0]?.createdAt ?? null;
    return {
      scope,
      activeKeyVersion: active?.keyVersion ?? null,
      totalKeys: scopeRows.length,
      oldestKey: oldest,
      retiredKeys: retired,
    };
  });
}

// Export for testing
export { wrapDataKey, unwrapDataKey };
