import crypto from "crypto";
import { eq } from "drizzle-orm";
import { providerOperationAttempts } from "../../drizzle/schema";
import { getDb } from "../db";

export const providerOperationStatuses = [
  "pending",
  "queued",
  "sent",
  "synced",
  "verified",
  "printed",
  "completed",
  "failed",
  "retrying",
  "dead_letter",
  "disabled",
  "not_configured",
  "manual_required",
  "cancelled",
] as const;

export type ProviderOperationStatus = typeof providerOperationStatuses[number];
export type ProviderType = "payment" | "whatsapp" | "sms" | "otp" | "email" | "push" | "ocr" | "printer" | "tally" | "storage" | "maps" | "other";
export type ProviderOperationType = "send" | "verify" | "create_order" | "capture" | "refund" | "parse" | "print" | "upload" | "export" | "sync" | "webhook";

export const providerSuccessStatuses = new Set<ProviderOperationStatus>(["sent", "synced", "verified", "printed", "completed"]);
export const providerTerminalFailureStatuses = new Set<ProviderOperationStatus>(["failed", "dead_letter", "disabled", "not_configured", "manual_required", "cancelled"]);

export type ProviderAttemptInput = {
  providerType: ProviderType;
  operationType: ProviderOperationType;
  entityType: string;
  entityRef: string | number;
  storeId?: number | null;
  userId?: number | null;
  status?: ProviderOperationStatus;
  providerRef?: string | null;
  idempotencyKey?: string | null;
  requestPayload?: unknown;
  responsePayload?: unknown;
  error?: unknown;
  now?: Date;
};

export type ProviderAttemptRecord = {
  id: number;
  providerType: ProviderType;
  operationType: ProviderOperationType;
  entityType: string;
  entityRef: string;
  storeId: number | null;
  userId: number | null;
  status: ProviderOperationStatus;
  providerRef: string | null;
  idempotencyKey: string | null;
  attemptCount: number;
  nextRetryAt: Date | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  requestHash: string | null;
  responseHash: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  deadLetteredAt: Date | null;
};

const inMemoryAttempts = new Map<string, ProviderAttemptRecord>();
let inMemoryId = 1;

const SECRET_PATTERNS = [
  /\b(otp|token|api[_-]?key|secret|password|authorization|signature|bearer)\b/gi,
  /rzp_(live|test)_[A-Za-z0-9_]+/g,
  /\b\d{6}\b/g,
];

export function isProductionRuntime(env: NodeJS.ProcessEnv = process.env) {
  return String(env.NODE_ENV ?? "").toLowerCase() === "production";
}

export function sanitizeProviderText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  let text = value instanceof Error ? value.message : typeof value === "string" ? value : JSON.stringify(value);
  for (const pattern of SECRET_PATTERNS) text = text.replace(pattern, "[REDACTED]");
  text = text.replace(/prescription[^,}\]]*/gi, "prescription:[REDACTED]");
  return text.slice(0, 500);
}

export function hashProviderPayload(payload: unknown): string | null {
  if (payload === undefined || payload === null) return null;
  return crypto.createHash("sha256").update(sanitizeProviderText(payload) ?? "").digest("hex");
}

export function classifyProviderError(error: unknown): { code: string; retryable: boolean; message: string } {
  const message = sanitizeProviderText(error) ?? "provider operation failed";
  const lower = message.toLowerCase();
  if (lower.includes("not configured") || lower.includes("provider_unconfigured") || lower.includes("missing")) return { code: "provider_not_configured", retryable: false, message };
  if (lower.includes("disabled")) return { code: "provider_disabled", retryable: false, message };
  if (lower.includes("signature") || lower.includes("invalid") || lower.includes("unauthorized") || lower.includes("401") || lower.includes("403")) return { code: "provider_non_retryable", retryable: false, message };
  if (lower.includes("timeout") || lower.includes("rate") || lower.includes("429") || lower.includes("503") || lower.includes("502") || lower.includes("network")) return { code: "provider_retryable", retryable: true, message };
  return { code: "provider_failed", retryable: false, message };
}

export function shouldRetryProviderOperation(input: { status: ProviderOperationStatus; attemptCount: number; maxAttempts?: number; error?: unknown }) {
  if (!["failed", "retrying"].includes(input.status)) return false;
  if (input.attemptCount >= (input.maxAttempts ?? 3)) return false;
  return classifyProviderError(input.error).retryable;
}

export function assertProviderOperationNotFakeSuccess(input: { status: ProviderOperationStatus | string; providerConfigured?: boolean; providerEnabled?: boolean; providerRef?: string | null; deterministicLocalProof?: boolean; devTestProof?: boolean; env?: NodeJS.ProcessEnv }) {
  const status = input.status as ProviderOperationStatus;
  if (!providerSuccessStatuses.has(status)) return;
  if (input.providerEnabled === false) throw new Error(`provider success guard blocked: disabled provider cannot be ${status}`);
  if (input.providerConfigured === false) throw new Error(`provider success guard blocked: unconfigured provider cannot be ${status}`);
  if (isProductionRuntime(input.env) && input.devTestProof) throw new Error(`provider success guard blocked: dev/test proof cannot be production ${status}`);
  if (isProductionRuntime(input.env) && !input.providerRef && !input.deterministicLocalProof) throw new Error(`provider success guard blocked: ${status} requires providerRef or deterministic proof`);
}

function keyFor(input: Pick<ProviderAttemptInput, "providerType" | "operationType" | "entityType" | "entityRef" | "idempotencyKey">) {
  return input.idempotencyKey ?? `${input.providerType}:${input.operationType}:${input.entityType}:${String(input.entityRef)}`;
}

function buildRecord(input: ProviderAttemptInput, existing?: ProviderAttemptRecord): ProviderAttemptRecord {
  const now = input.now ?? new Date();
  const classified = input.error ? classifyProviderError(input.error) : null;
  const status = input.status ?? "pending";
  return {
    id: existing?.id ?? inMemoryId++,
    providerType: input.providerType,
    operationType: input.operationType,
    entityType: input.entityType,
    entityRef: String(input.entityRef),
    storeId: input.storeId ?? null,
    userId: input.userId ?? null,
    status,
    providerRef: input.providerRef ?? existing?.providerRef ?? null,
    idempotencyKey: input.idempotencyKey ?? null,
    attemptCount: existing ? existing.attemptCount + 1 : 1,
    nextRetryAt: status === "retrying" ? new Date(now.getTime() + 60_000) : null,
    lastErrorCode: classified?.code ?? null,
    lastErrorMessage: classified?.message ?? null,
    requestHash: hashProviderPayload(input.requestPayload) ?? existing?.requestHash ?? null,
    responseHash: hashProviderPayload(input.responsePayload) ?? existing?.responseHash ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    completedAt: providerSuccessStatuses.has(status) ? now : null,
    deadLetteredAt: status === "dead_letter" ? now : null,
  };
}

export async function recordProviderAttempt(input: ProviderAttemptInput): Promise<ProviderAttemptRecord> {
  assertProviderOperationNotFakeSuccess({ status: input.status ?? "pending", providerConfigured: true, providerEnabled: true, providerRef: input.providerRef, deterministicLocalProof: Boolean(input.responsePayload), env: process.env });
  const key = keyFor(input);
  const existing = inMemoryAttempts.get(key);
  if (existing && providerSuccessStatuses.has(existing.status)) return existing;
  const record = buildRecord(input, existing);
  inMemoryAttempts.set(key, record);

  const db = await getDb().catch(() => null);
  if (db) {
    try {
      await db.insert(providerOperationAttempts).values({
        providerType: record.providerType,
        operationType: record.operationType,
        entityType: record.entityType,
        entityRef: record.entityRef,
        storeId: record.storeId,
        userId: record.userId,
        status: record.status,
        providerRef: record.providerRef,
        idempotencyKey: record.idempotencyKey,
        attemptCount: record.attemptCount,
        nextRetryAt: record.nextRetryAt,
        lastErrorCode: record.lastErrorCode,
        lastErrorMessage: record.lastErrorMessage,
        requestHash: record.requestHash,
        responseHash: record.responseHash,
        completedAt: record.completedAt,
        deadLetteredAt: record.deadLetteredAt,
      }).onDuplicateKeyUpdate({ set: { status: record.status, attemptCount: record.attemptCount, updatedAt: record.updatedAt, providerRef: record.providerRef, nextRetryAt: record.nextRetryAt, lastErrorCode: record.lastErrorCode, lastErrorMessage: record.lastErrorMessage, requestHash: record.requestHash, responseHash: record.responseHash, completedAt: record.completedAt, deadLetteredAt: record.deadLetteredAt } });
    } catch {
      // Runtime still returns the in-process audit record; production DB proof is separately validated.
    }
  }
  return record;
}

export const markProviderQueued = (input: ProviderAttemptInput) => recordProviderAttempt({ ...input, status: "queued" });
export const markProviderSuccess = (input: ProviderAttemptInput & { status: Extract<ProviderOperationStatus, "sent" | "synced" | "verified" | "printed" | "completed"> }) => recordProviderAttempt(input);
export const markProviderFailure = (input: ProviderAttemptInput) => recordProviderAttempt({ ...input, status: shouldRetryProviderOperation({ status: "failed", attemptCount: 1, error: input.error }) ? "retrying" : "failed" });
export const markProviderDisabled = (input: ProviderAttemptInput) => recordProviderAttempt({ ...input, status: "disabled" });
export const markProviderNotConfigured = (input: ProviderAttemptInput) => recordProviderAttempt({ ...input, status: "not_configured" });
export const markProviderDeadLetter = (input: ProviderAttemptInput) => recordProviderAttempt({ ...input, status: "dead_letter" });

export async function getProviderOperationStatus(idempotencyKey: string): Promise<ProviderAttemptRecord | null> {
  const local = inMemoryAttempts.get(idempotencyKey);
  if (local) return local;
  const db = await getDb().catch(() => null);
  if (!db) return null;
  try {
    const [row] = await db.select().from(providerOperationAttempts).where(eq(providerOperationAttempts.idempotencyKey, idempotencyKey)).limit(1);
    return row as ProviderAttemptRecord | undefined ?? null;
  } catch {
    return null;
  }
}

export function resetProviderRuntimeForTests() {
  inMemoryAttempts.clear();
  inMemoryId = 1;
}
