import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { logAudit } from "./audit";

export type IdempotencyStatus = "started"|"completed"|"failed";

export function buildIdempotencyKey(parts: Array<string|number|undefined|null>) { return parts.filter(Boolean).join(":"); }
export function assertIdempotencyKeyPresent(key?: string | null) { if (!key) throw new TRPCError({ code: "BAD_REQUEST", message: "Missing idempotency key" }); }
export function createMutationFingerprint(payload: unknown) { return Buffer.from(JSON.stringify(payload)).toString("base64url").slice(0,256); }
export function getRequestIdFromContext(ctx: any) { return ctx?.req?.headers?.["x-request-id"] ?? ctx?.requestId ?? null; }

async function getTable() { const { idempotencyKeys } = await import("../../drizzle/schema"); return idempotencyKeys; }
async function getDb() { const { getDb } = await import("../db"); return getDb(); }

export async function beginIdempotentOperation(input: any) {
  const db = await getDb(); const table = await getTable(); if (!db) throw new TRPCError({code:"INTERNAL_SERVER_ERROR"});
  const [existing] = await db.select().from(table).where(and(eq(table.key,input.key), eq(table.scope,input.scope))).limit(1);
  if (existing) return existing;
  await db.insert(table).values({ key: input.key, scope: input.scope, operationType: input.operationType, actorId: input.actorId ?? null, storeId: input.storeId ?? null, entityType: input.entityType ?? null, entityId: input.entityId ?? null, status: "started", requestHash: input.requestHash ?? null, expiresAt: input.expiresAt ?? null });
  await logAudit({ action: "idempotency.operation_started", entityType: input.entityType ?? "idempotency", entityId: input.entityId ? Number(input.entityId) : null, afterJson: { key: input.key, scope: input.scope } }, input.ctx);
  const [created] = await db.select().from(table).where(and(eq(table.key,input.key), eq(table.scope,input.scope))).limit(1);
  return created;
}
export async function completeIdempotentOperation(key:string, scope:string, resultJson: unknown, ctx?: any) { const db=await getDb(); const table=await getTable(); if (!db) return; await db.update(table).set({ status:"completed", resultJson: resultJson as any }).where(and(eq(table.key,key), eq(table.scope,scope))); await logAudit({ action:"idempotency.operation_completed", entityType:"idempotency", entityId:null, afterJson:{key,scope}}, ctx); }
export async function failIdempotentOperation(key:string, scope:string, errorJson: unknown) { const db=await getDb(); const table=await getTable(); if (!db) return; await db.update(table).set({ status:"failed", errorJson: errorJson as any }).where(and(eq(table.key,key), eq(table.scope,scope))); }
export async function getExistingIdempotentResult(key:string, scope:string) { const db=await getDb(); const table=await getTable(); if (!db) return null; const [r]=await db.select().from(table).where(and(eq(table.key,key), eq(table.scope,scope))).limit(1); return r ?? null; }
export function assertNotAlreadyProcessed(status: IdempotencyStatus) { if (status === "completed") throw new TRPCError({ code: "CONFLICT", message: "Operation already processed" }); }
export async function withIdempotency<T>(params:any, fn:()=>Promise<T>): Promise<T> { assertIdempotencyKeyPresent(params.key); const existing = await beginIdempotentOperation(params); if (existing?.status === "completed" && existing.resultJson) { await logAudit({ action:"idempotency.duplicate_detected", entityType:params.entityType??"idempotency", entityId:params.entityId ? Number(params.entityId) : null, afterJson:{key:params.key, scope:params.scope} }, params.ctx); return existing.resultJson as T; } if (existing?.status === "started" && existing.requestHash && existing.requestHash !== params.requestHash) throw new TRPCError({code:"CONFLICT", message:"Duplicate in-progress operation"}); try { const result = await fn(); await completeIdempotentOperation(params.key, params.scope, result, params.ctx); return result; } catch (e:any) { await failIdempotentOperation(params.key, params.scope, { message: e?.message ?? "error" }); throw e; } }
