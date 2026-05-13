/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any */
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createHash } from "node:crypto";
import { logAudit } from "./audit";

export type IdempotencyStatus = "started" | "completed" | "failed";

type IdempotencyRow = {
  key: string;
  scope: string;
  status: IdempotencyStatus;
  requestHash?: string | null;
  resultJson?: unknown;
  errorJson?: unknown;
  __created?: boolean;
};

export function buildIdempotencyKey(
  parts: Array<string | number | undefined | null>
) {
  return parts.filter(Boolean).join(":");
}
export function assertIdempotencyKeyPresent(key?: string | null) {
  if (!key)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Missing idempotency key",
    });
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const v = (value as Record<string, unknown>)[key];
    if (v !== undefined) out[key] = canonicalize(v);
  }
  return out;
}

export function canonicalJson(payload: unknown) {
  return JSON.stringify(canonicalize(payload));
}
export function createMutationFingerprint(payload: unknown) {
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}
export function getRequestIdFromContext(ctx: any) {
  return ctx?.req?.headers?.["x-request-id"] ?? ctx?.requestId ?? null;
}

function isDuplicateKeyError(error: unknown) {
  const e = error as { code?: string; errno?: number; message?: string };
  return (
    e?.code === "ER_DUP_ENTRY" ||
    e?.errno === 1062 ||
    /duplicate/i.test(String(e?.message ?? ""))
  );
}

function numericEntityIdOrNull(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^[0-9]+$/.test(value)) return Number(value);
  return null;
}

async function getTable() {
  const { idempotencyKeys } = await import("../../drizzle/schema");
  return idempotencyKeys;
}
async function getDb() {
  const { getDb } = await import("../db");
  return getDb();
}

async function fetchOperation(db: any, table: any, key: string, scope: string) {
  const [row] = await db
    .select()
    .from(table)
    .where(and(eq(table.key, key), eq(table.scope, scope)))
    .limit(1);
  return row ?? null;
}

export async function beginIdempotentOperation(input: any) {
  const db = await getDb();
  const table = await getTable();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
  assertIdempotencyKeyPresent(input.key);
  const values = {
    key: input.key,
    scope: input.scope,
    operationType: input.operationType,
    actorId: input.actorId ?? null,
    storeId: input.storeId ?? null,
    entityType: input.entityType ?? null,
    entityId: input.entityId == null ? null : String(input.entityId),
    status: "started" as const,
    requestHash: input.requestHash ?? null,
    expiresAt: input.expiresAt ?? null,
  };
  try {
    await db.insert(table).values(values);
    const created = await fetchOperation(db, table, input.key, input.scope);
    await logAudit(
      {
        action: "idempotency.operation_started",
        entityType: input.entityType ?? "idempotency",
        entityId: numericEntityIdOrNull(input.entityId),
        afterJson: {
          key: input.key,
          scope: input.scope,
          entityRef: input.entityId == null ? null : String(input.entityId),
        },
      },
      input.ctx
    );
    return created ? { ...created, __created: true } : null;
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    const existing = await fetchOperation(db, table, input.key, input.scope);
    if (!existing)
      throw new TRPCError({
        code: "CONFLICT",
        message: "Idempotency operation exists but could not be loaded",
      });
    return { ...existing, __created: false };
  }
}
export async function completeIdempotentOperation(
  key: string,
  scope: string,
  resultJson: unknown,
  ctx?: any
) {
  const db = await getDb();
  const table = await getTable();
  if (!db) return;
  await db
    .update(table)
    .set({ status: "completed", resultJson: resultJson })
    .where(and(eq(table.key, key), eq(table.scope, scope)));
  await logAudit(
    {
      action: "idempotency.operation_completed",
      entityType: "idempotency",
      entityId: null,
      afterJson: { key, scope },
    },
    ctx
  );
}
export async function failIdempotentOperation(
  key: string,
  scope: string,
  errorJson: unknown
) {
  const db = await getDb();
  const table = await getTable();
  if (!db) return;
  await db
    .update(table)
    .set({ status: "failed", errorJson: errorJson })
    .where(and(eq(table.key, key), eq(table.scope, scope)));
}
export async function getExistingIdempotentResult(key: string, scope: string) {
  const db = await getDb();
  const table = await getTable();
  if (!db) return null;
  return fetchOperation(db, table, key, scope);
}
export function assertNotAlreadyProcessed(status: IdempotencyStatus) {
  if (status === "completed")
    throw new TRPCError({
      code: "CONFLICT",
      message: "Operation already processed",
    });
}

function assertRequestHashMatches(
  existing: IdempotencyRow,
  requestHash?: string | null
) {
  if (
    existing.requestHash &&
    requestHash &&
    existing.requestHash !== requestHash
  )
    throw new TRPCError({
      code: "CONFLICT",
      message: "Idempotency key reused with different payload",
    });
}

export async function withIdempotency<T>(
  params: any,
  fn: () => Promise<T>
): Promise<T> {
  assertIdempotencyKeyPresent(params.key);
  const existing = (await beginIdempotentOperation(
    params
  )) as IdempotencyRow | null;
  if (!existing)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Unable to create idempotency operation",
    });
  assertRequestHashMatches(existing, params.requestHash);
  if (existing.status === "completed") {
    await logAudit(
      {
        action: "idempotency.duplicate_detected",
        entityType: params.entityType ?? "idempotency",
        entityId: numericEntityIdOrNull(params.entityId),
        afterJson: {
          key: params.key,
          scope: params.scope,
          entityRef: params.entityId == null ? null : String(params.entityId),
        },
      },
      params.ctx
    );
    return existing.resultJson as T;
  }
  if (existing.status === "started" && !existing.__created)
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "Duplicate in-progress operation; retry after the first request finishes",
    });
  // Failed operations may be retried only with the same requestHash. A successful retry overwrites the failed state.
  try {
    const result = await fn();
    await completeIdempotentOperation(
      params.key,
      params.scope,
      result,
      params.ctx
    );
    return result;
  } catch (e: any) {
    await failIdempotentOperation(params.key, params.scope, {
      message: e?.message ?? "error",
    });
    throw e;
  }
}
