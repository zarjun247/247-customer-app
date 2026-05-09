import crypto from "crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { providerOperationAttempts } from "../../drizzle/schema";
import { enqueueJob } from "./jobQueue";

export const PROVIDER_OPERATION_STATUSES = [
  "pending",
  "queued",
  "completed",
  "sent",
  "synced",
  "verified",
  "printed",
  "failed",
  "retrying",
  "dead_letter",
  "disabled",
  "not_configured",
  "manual_required",
  "cancelled",
] as const;

export type ProviderOperationStatus =
  (typeof PROVIDER_OPERATION_STATUSES)[number];

export const PROVIDER_SUCCESS_STATUSES = [
  "completed",
  "sent",
  "synced",
  "verified",
  "printed",
] as const satisfies readonly ProviderOperationStatus[];

export const PROVIDER_NON_SUCCESS_STATUSES = [
  "pending",
  "queued",
  "failed",
  "retrying",
  "dead_letter",
  "disabled",
  "not_configured",
  "manual_required",
  "cancelled",
] as const satisfies readonly ProviderOperationStatus[];

export type ProviderSuccessStatus = (typeof PROVIDER_SUCCESS_STATUSES)[number];

export const PROVIDER_TYPES = [
  "payment",
  "whatsapp",
  "sms",
  "otp",
  "email",
  "push",
  "ocr",
  "printer",
  "tally",
  "storage",
  "maps",
  "other",
] as const;

export type ProviderType = (typeof PROVIDER_TYPES)[number];

export const PROVIDER_OPERATION_TYPES = [
  "send",
  "verify",
  "create_order",
  "capture",
  "refund",
  "parse",
  "print",
  "upload",
  "export",
  "sync",
  "webhook",
  "healthcheck",
  "other",
] as const;

export type ProviderOperationType = (typeof PROVIDER_OPERATION_TYPES)[number];

export type ProviderErrorClass =
  | "retryable"
  | "non_retryable"
  | "configuration"
  | "disabled"
  | "manual_required";

export type ProviderErrorClassification = {
  retryable: boolean;
  errorClass: ProviderErrorClass;
  code: string;
  message: string;
};

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
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
  nextRetryAt?: Date | null;
  attemptCount?: number;
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

const SECRET_KEY_PATTERN =
  /(secret|token|password|authorization|api[_-]?key|cookie|session|credential|private[_-]?key|signature|otp|code)/i;
const PHI_KEY_PATTERN =
  /(prescription|medical|diagnosis|patient|ocr|raw|base64|image|document|blob|fileData|payloadJson)/i;
const MAX_STRING_LENGTH = 512;
const memoryAttempts = new Map<string, ProviderAttemptRecord>();
let nextMemoryAttemptId = 1;

function now() {
  return new Date();
}

function isProductionRuntime() {
  return String(process.env.NODE_ENV ?? "").toLowerCase() === "production";
}

function isProviderOperationStatus(
  value: string
): value is ProviderOperationStatus {
  return (PROVIDER_OPERATION_STATUSES as readonly string[]).includes(value);
}

export function isProviderSuccessStatus(
  status: ProviderOperationStatus
): status is ProviderSuccessStatus {
  return (PROVIDER_SUCCESS_STATUSES as readonly string[]).includes(status);
}

function normalizeEntityRef(entityRef: string | number) {
  return String(entityRef);
}

function defaultIdempotencyKey(
  input: Pick<
    ProviderAttemptInput,
    "providerType" | "operationType" | "entityType" | "entityRef"
  >
) {
  return `${input.providerType}:${input.operationType}:${input.entityType}:${normalizeEntityRef(input.entityRef)}`;
}

export function sanitizeProviderPayload(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[REDACTED:depth_limit]";
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return `[REDACTED:buffer:${value.length}]`;
  if (Array.isArray(value))
    return value.map(item => sanitizeProviderPayload(item, depth + 1));
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(
      value as Record<string, unknown>
    )) {
      if (SECRET_KEY_PATTERN.test(key) || PHI_KEY_PATTERN.test(key)) {
        result[key] = "[REDACTED]";
      } else {
        result[key] = sanitizeProviderPayload(nested, depth + 1);
      }
    }
    return result;
  }
  if (typeof value === "string") {
    if (/^Bearer\s+/i.test(value)) return "[REDACTED]";
    if (/^[A-Za-z0-9+/=]{256,}$/.test(value))
      return `[REDACTED:encoded:${value.length}]`;
    if (value.length > MAX_STRING_LENGTH)
      return `[REDACTED:length:${value.length}]`;
  }
  return value;
}

export function hashProviderPayload(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const sanitized = sanitizeProviderPayload(value);
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(sanitized))
    .digest("hex");
}

export function sanitizeProviderErrorMessage(
  message?: string | null
): string | null {
  if (!message) return null;
  const sanitized = sanitizeProviderPayload({ message }) as {
    message?: unknown;
  };
  const text = String(sanitized.message ?? "provider operation failed");
  return text.length > 500 ? `${text.slice(0, 497)}...` : text;
}

function cloneAttempt(record: ProviderAttemptRecord): ProviderAttemptRecord {
  return { ...record };
}

function memoryKey(input: ProviderAttemptInput) {
  return input.idempotencyKey || defaultIdempotencyKey(input);
}

async function persistAttempt(record: ProviderAttemptRecord): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const values = {
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
  };
  await db
    .insert(providerOperationAttempts)
    .values(values)
    .onDuplicateKeyUpdate({
      set: {
        status: values.status,
        providerRef: values.providerRef,
        attemptCount: values.attemptCount,
        nextRetryAt: values.nextRetryAt,
        lastErrorCode: values.lastErrorCode,
        lastErrorMessage: values.lastErrorMessage,
        responseHash: values.responseHash,
        completedAt: values.completedAt,
        deadLetteredAt: values.deadLetteredAt,
        updatedAt: now(),
      },
    });
}

function buildAttemptRecord(
  input: ProviderAttemptInput,
  previous?: ProviderAttemptRecord
): ProviderAttemptRecord {
  const createdAt = previous?.createdAt ?? now();
  const status = input.status ?? previous?.status ?? "pending";
  assertProviderOperationNotFakeSuccess({
    providerType: input.providerType,
    operationType: input.operationType,
    status,
    configured: status !== "not_configured",
    enabled: status !== "disabled",
    proof: isProviderSuccessStatus(status)
      ? input.providerRef ||
        input.responsePayload ||
        previous?.providerRef ||
        previous?.responseHash
      : undefined,
  });
  return {
    id: previous?.id ?? nextMemoryAttemptId++,
    providerType: input.providerType,
    operationType: input.operationType,
    entityType: input.entityType,
    entityRef: normalizeEntityRef(input.entityRef),
    storeId: input.storeId ?? previous?.storeId ?? null,
    userId: input.userId ?? previous?.userId ?? null,
    status,
    providerRef: input.providerRef ?? previous?.providerRef ?? null,
    idempotencyKey:
      input.idempotencyKey ??
      previous?.idempotencyKey ??
      defaultIdempotencyKey(input),
    attemptCount:
      input.attemptCount ?? (previous ? previous.attemptCount + 1 : 1),
    nextRetryAt: input.nextRetryAt ?? null,
    lastErrorCode: input.lastErrorCode ?? null,
    lastErrorMessage:
      sanitizeProviderErrorMessage(input.lastErrorMessage) ?? null,
    requestHash:
      hashProviderPayload(input.requestPayload) ??
      previous?.requestHash ??
      null,
    responseHash:
      hashProviderPayload(input.responsePayload) ??
      previous?.responseHash ??
      null,
    createdAt,
    updatedAt: now(),
    completedAt: isProviderSuccessStatus(status)
      ? now()
      : (previous?.completedAt ?? null),
    deadLetteredAt:
      status === "dead_letter" ? now() : (previous?.deadLetteredAt ?? null),
  };
}

export async function recordProviderAttempt(
  input: ProviderAttemptInput
): Promise<ProviderAttemptRecord> {
  const key = memoryKey(input);
  const previous = memoryAttempts.get(key);
  const record = buildAttemptRecord(input, previous);
  memoryAttempts.set(key, record);
  await persistAttempt(record);
  return cloneAttempt(record);
}

export async function markProviderQueued(
  input: ProviderAttemptInput
): Promise<ProviderAttemptRecord> {
  const attempt = await recordProviderAttempt({ ...input, status: "queued" });
  if (shouldRetryProviderOperation({ retryable: true }, attempt.attemptCount)) {
    await enqueueJob({
      queueName: "provider-operations",
      jobType: `${input.providerType}.${input.operationType}`,
      payloadJson: {
        providerType: input.providerType,
        operationType: input.operationType,
        entityType: input.entityType,
        entityRef: normalizeEntityRef(input.entityRef),
      },
      idempotencyKey: `provider:${attempt.idempotencyKey}`,
      relatedEntityType: input.entityType,
      relatedEntityId: normalizeEntityRef(input.entityRef),
      scheduledAt: input.nextRetryAt ?? null,
    });
  }
  return attempt;
}

export async function markProviderCompleted(
  input: ProviderAttemptInput
): Promise<ProviderAttemptRecord> {
  return recordProviderAttempt({ ...input, status: "completed" });
}

export async function markProviderSuccess(
  input: ProviderAttemptInput & { status: ProviderSuccessStatus }
): Promise<ProviderAttemptRecord> {
  return recordProviderAttempt(input);
}

export async function markProviderFailure(
  input: ProviderAttemptInput & { error?: unknown; retryable?: boolean }
): Promise<ProviderAttemptRecord> {
  const classification = classifyProviderError(
    input.error ?? input.lastErrorMessage ?? "provider operation failed"
  );
  const retrying = input.retryable ?? classification.retryable;
  return recordProviderAttempt({
    ...input,
    status: retrying ? "retrying" : "failed",
    lastErrorCode: input.lastErrorCode ?? classification.code,
    lastErrorMessage: input.lastErrorMessage ?? classification.message,
    nextRetryAt: retrying
      ? (input.nextRetryAt ?? new Date(Date.now() + 60_000))
      : null,
  });
}

export async function markProviderDisabled(
  input: ProviderAttemptInput
): Promise<ProviderAttemptRecord> {
  return recordProviderAttempt({
    ...input,
    status: "disabled",
    lastErrorCode: input.lastErrorCode ?? "provider_disabled",
  });
}

export async function markProviderNotConfigured(
  input: ProviderAttemptInput
): Promise<ProviderAttemptRecord> {
  return recordProviderAttempt({
    ...input,
    status: "not_configured",
    lastErrorCode: input.lastErrorCode ?? "provider_not_configured",
  });
}

export async function markProviderManualRequired(
  input: ProviderAttemptInput
): Promise<ProviderAttemptRecord> {
  return recordProviderAttempt({
    ...input,
    status: "manual_required",
    lastErrorCode: input.lastErrorCode ?? "manual_required",
  });
}

export async function markProviderDeadLetter(
  input: ProviderAttemptInput
): Promise<ProviderAttemptRecord> {
  return recordProviderAttempt({ ...input, status: "dead_letter" });
}

export async function getProviderOperationStatus(input: {
  idempotencyKey?: string | null;
  providerType?: ProviderType;
  operationType?: ProviderOperationType;
  entityType?: string;
  entityRef?: string | number;
}): Promise<ProviderOperationStatus | null> {
  const key =
    input.idempotencyKey ??
    (input.providerType &&
    input.operationType &&
    input.entityType &&
    input.entityRef !== undefined
      ? defaultIdempotencyKey(input as ProviderAttemptInput)
      : null);
  if (key && memoryAttempts.has(key))
    return memoryAttempts.get(key)?.status ?? null;
  if (input.idempotencyKey) {
    const db = await getDb();
    if (db) {
      const [row] = await db
        .select({ status: providerOperationAttempts.status })
        .from(providerOperationAttempts)
        .where(
          eq(providerOperationAttempts.idempotencyKey, input.idempotencyKey)
        )
        .limit(1);
      if (row?.status && isProviderOperationStatus(row.status))
        return row.status;
    }
  }
  return null;
}

export function classifyProviderError(
  error: unknown
): ProviderErrorClassification {
  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "provider operation failed";
  const message =
    sanitizeProviderErrorMessage(rawMessage) ?? "provider operation failed";
  const lower = message.toLowerCase();
  if (/(disabled|turned off)/.test(lower))
    return {
      retryable: false,
      errorClass: "disabled",
      code: "provider_disabled",
      message,
    };
  if (
    /(unconfigured|not configured|missing|credential|api key|secret)/.test(
      lower
    )
  )
    return {
      retryable: false,
      errorClass: "configuration",
      code: "provider_not_configured",
      message,
    };
  if (/(manual|review|operator|browser)/.test(lower))
    return {
      retryable: false,
      errorClass: "manual_required",
      code: "manual_required",
      message,
    };
  if (
    /(timeout|temporar|rate.?limit|429|5\d\d|network|econnreset|unavailable)/.test(
      lower
    )
  )
    return {
      retryable: true,
      errorClass: "retryable",
      code: "provider_retryable",
      message,
    };
  return {
    retryable: false,
    errorClass: "non_retryable",
    code: "provider_failed",
    message,
  };
}

export function shouldRetryProviderOperation(
  classification: Pick<ProviderErrorClassification, "retryable">,
  attemptCount: number,
  maxAttempts = 3
): boolean {
  return classification.retryable && attemptCount < maxAttempts;
}

export function assertProviderOperationNotFakeSuccess(input: {
  providerType: ProviderType | string;
  operationType: ProviderOperationType | string;
  status: ProviderOperationStatus | string;
  configured?: boolean;
  enabled?: boolean;
  proof?: unknown;
  runtime?: string;
}): void {
  const status = String(input.status);
  if (!isProviderOperationStatus(status))
    throw new Error(`Unknown provider operation status: ${status}`);
  const success = isProviderSuccessStatus(status);
  const runtime = input.runtime ?? process.env.NODE_ENV ?? "development";
  if (!success) return;
  if (input.enabled === false)
    throw new Error(
      `${input.providerType}.${input.operationType} cannot be ${status}: provider disabled`
    );
  if (input.configured === false)
    throw new Error(
      `${input.providerType}.${input.operationType} cannot be ${status}: provider not configured`
    );
  if (isProductionRuntime() || runtime === "production") {
    if (!input.proof)
      throw new Error(
        `${input.providerType}.${input.operationType} cannot be ${status} in production without provider confirmation or deterministic local proof`
      );
  }
}

export function resetProviderAttemptsForTests(): void {
  memoryAttempts.clear();
  nextMemoryAttemptId = 1;
}

export function getProviderAttemptsForTests(): ProviderAttemptRecord[] {
  return Array.from(memoryAttempts.values()).map(cloneAttempt);
}
