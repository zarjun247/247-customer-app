import crypto from "crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { offlineOperationQueue } from "../../drizzle/schema";
import { getDb } from "../db";
import {
  assertOperationAllowedInMode,
  getOfflineOperationPolicy,
  type OfflineOperationCategory,
  type OfflineOperationType,
  type OfflineRuntimeMode,
} from "./offlineDegradationPolicy";
import { assertProviderNotFakeSuccessful, type ProviderResultLike } from "./providerContract";

export type OfflineOperationStatus = "queued" | "replaying" | "applied" | "rejected" | "conflict" | "expired" | "cancelled";
export type ReplayConflictReason =
  | "regulated_or_financial_gate_blocked"
  | "stale_stock"
  | "stale_price"
  | "customer_changed"
  | "prescription_changed"
  | "provider_unavailable"
  | "expired"
  | "online_validation_failed"
  | "unknown";

export type OfflineOperationRecord = {
  id: number;
  storeId: number;
  terminalId: string;
  actorId: number | null;
  operationType: string;
  operationCategory: OfflineOperationCategory;
  payloadJson: Record<string, unknown>;
  payloadHash: string;
  idempotencyKey: string;
  status: OfflineOperationStatus;
  replayAttempts: number;
  lastReplayAt: Date | null;
  conflictReason: string | null;
  rejectionReason: string | null;
  duplicateCount: number;
  createdAt: Date;
  updatedAt: Date;
};

export type QueueOfflineOperationInput = {
  storeId: number;
  terminalId: string;
  actorId?: number | null;
  operationType: OfflineOperationType | string;
  payloadJson?: Record<string, unknown>;
  idempotencyKey?: string;
  mode?: OfflineRuntimeMode;
};

export type QueueOfflineOperationResult = {
  operation: OfflineOperationRecord;
  duplicate: boolean;
};

export type ReplayValidationContext = {
  currentStockVersion?: string | number | null;
  currentPriceVersion?: string | number | null;
  currentCustomerVersion?: string | number | null;
  currentPrescriptionVersion?: string | number | null;
  providerResult?: ProviderResultLike | null;
  now?: Date;
  maxAgeMs?: number;
};

export type ReplayApplyHandler = (operation: OfflineOperationRecord) => Promise<{ applied: boolean; reason?: string }>;
export type OfflineReplayEventWriter = (event: { operation: OfflineOperationRecord; outcome: OfflineOperationStatus; reason?: string | null }) => Promise<void> | void;

export type OfflineQueueRepository = {
  create(input: Omit<OfflineOperationRecord, "id" | "createdAt" | "updatedAt">): Promise<OfflineOperationRecord>;
  findByIdempotencyKey(idempotencyKey: string): Promise<OfflineOperationRecord | null>;
  findById(id: number): Promise<OfflineOperationRecord | null>;
  listForStore(storeId: number, statuses?: OfflineOperationStatus[]): Promise<OfflineOperationRecord[]>;
  update(id: number, patch: Partial<OfflineOperationRecord>): Promise<OfflineOperationRecord>;
};

const sensitiveKeyPatterns = [
  /secret/i,
  /token/i,
  /signature/i,
  /authorization/i,
  /password/i,
  /provider.*key/i,
  /payment.*(key|id|secret|token|signature)/i,
  /razorpay.*(key|secret|signature|token)/i,
  /prescription.*(blob|image|file|base64|bytes)/i,
  /image.*(blob|base64|bytes)/i,
  /raw.*provider/i,
];

function isSensitiveKey(key: string): boolean {
  return sensitiveKeyPatterns.some(pattern => pattern.test(key));
}

function sanitizeValue(value: unknown, key = ""): unknown {
  if (isSensitiveKey(key)) return "[REDACTED_OFFLINE_QUEUE]";
  if (typeof value === "string") {
    if (value.length > 512 && /^(data:image|[A-Za-z0-9+/]{512,}={0,2}$)/.test(value.slice(0, 530))) {
      return "[REDACTED_BLOB]";
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(item => sanitizeValue(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([childKey, childValue]) => [childKey, sanitizeValue(childValue, childKey)]),
    );
  }
  return value;
}

export function sanitizeOfflinePayload(payload: Record<string, unknown> = {}): Record<string, unknown> {
  return sanitizeValue(payload) as Record<string, unknown>;
}

export function hashOfflinePayload(payload: Record<string, unknown>): string {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export class InMemoryOfflineQueueRepository implements OfflineQueueRepository {
  private rows: OfflineOperationRecord[] = [];
  private nextId = 1;

  constructor(seed: OfflineOperationRecord[] = []) {
    this.rows = seed.map(row => ({ ...row, payloadJson: { ...row.payloadJson } }));
    this.nextId = Math.max(0, ...seed.map(row => row.id)) + 1;
  }

  async create(input: Omit<OfflineOperationRecord, "id" | "createdAt" | "updatedAt">) {
    const now = new Date();
    const row: OfflineOperationRecord = { ...input, id: this.nextId++, createdAt: now, updatedAt: now };
    this.rows.push(row);
    return row;
  }

  async findByIdempotencyKey(idempotencyKey: string) {
    return this.rows.find(row => row.idempotencyKey === idempotencyKey) ?? null;
  }

  async findById(id: number) {
    return this.rows.find(row => row.id === id) ?? null;
  }

  async listForStore(storeId: number, statuses?: OfflineOperationStatus[]) {
    return this.rows.filter(row => row.storeId === storeId && (!statuses || statuses.includes(row.status)));
  }

  async update(id: number, patch: Partial<OfflineOperationRecord>) {
    const index = this.rows.findIndex(row => row.id === id);
    if (index < 0) throw new Error(`offline operation not found: ${id}`);
    this.rows[index] = { ...this.rows[index], ...patch, updatedAt: new Date() };
    return this.rows[index];
  }
}

function fromDbRow(row: any): OfflineOperationRecord {
  const payload = typeof row.payloadJson === "string" ? JSON.parse(row.payloadJson || "{}") : row.payloadJson ?? {};
  return {
    ...row,
    payloadJson: payload,
    createdAt: row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt),
    lastReplayAt: row.lastReplayAt ? new Date(row.lastReplayAt) : null,
  };
}

export class DrizzleOfflineQueueRepository implements OfflineQueueRepository {
  constructor(private readonly db: NonNullable<Awaited<ReturnType<typeof getDb>>>) {}

  async create(input: Omit<OfflineOperationRecord, "id" | "createdAt" | "updatedAt">) {
    const insert = {
      storeId: input.storeId,
      terminalId: input.terminalId,
      actorId: input.actorId,
      operationType: input.operationType,
      operationCategory: input.operationCategory,
      payloadJson: JSON.stringify(input.payloadJson),
      payloadHash: input.payloadHash,
      idempotencyKey: input.idempotencyKey,
      status: input.status,
      replayAttempts: input.replayAttempts,
      lastReplayAt: input.lastReplayAt,
      conflictReason: input.conflictReason,
      rejectionReason: input.rejectionReason,
      duplicateCount: input.duplicateCount,
    };
    const res = await this.db.insert(offlineOperationQueue).values(insert as any);
    const id = Number((res as any)[0]?.insertId ?? (res as any).insertId);
    const row = await this.findById(id);
    if (!row) throw new Error("failed to load inserted offline operation");
    return row;
  }

  async findByIdempotencyKey(idempotencyKey: string) {
    const rows = await this.db.select().from(offlineOperationQueue).where(eq(offlineOperationQueue.idempotencyKey, idempotencyKey)).limit(1);
    return rows[0] ? fromDbRow(rows[0]) : null;
  }

  async findById(id: number) {
    const rows = await this.db.select().from(offlineOperationQueue).where(eq(offlineOperationQueue.id, id)).limit(1);
    return rows[0] ? fromDbRow(rows[0]) : null;
  }

  async listForStore(storeId: number, statuses?: OfflineOperationStatus[]) {
    const condition = statuses?.length
      ? and(eq(offlineOperationQueue.storeId, storeId), inArray(offlineOperationQueue.status, statuses as any))
      : eq(offlineOperationQueue.storeId, storeId);
    const rows = await this.db.select().from(offlineOperationQueue).where(condition as any);
    return rows.map(fromDbRow);
  }

  async update(id: number, patch: Partial<OfflineOperationRecord>) {
    const update: Record<string, unknown> = { ...patch };
    if (patch.payloadJson) update.payloadJson = JSON.stringify(patch.payloadJson);
    delete update.id;
    delete update.createdAt;
    await this.db.update(offlineOperationQueue).set(update as any).where(eq(offlineOperationQueue.id, id));
    const row = await this.findById(id);
    if (!row) throw new Error(`offline operation not found: ${id}`);
    return row;
  }
}

export async function getOfflineQueueRepository(): Promise<OfflineQueueRepository | null> {
  const db = await getDb();
  return db ? new DrizzleOfflineQueueRepository(db) : null;
}

export async function queueOfflineOperation(
  input: QueueOfflineOperationInput,
  repository?: OfflineQueueRepository,
): Promise<QueueOfflineOperationResult> {
  if (!input.idempotencyKey?.trim()) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "offline operation idempotencyKey is required" });
  }

  const mode = input.mode ?? "offline";
  const policy = assertOperationAllowedInMode(input.operationType, mode);
  const repo = repository ?? await getOfflineQueueRepository();
  if (!repo) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "offline queue storage unavailable" });

  const existing = await repo.findByIdempotencyKey(input.idempotencyKey);
  if (existing) {
    const updated = await repo.update(existing.id, { duplicateCount: existing.duplicateCount + 1 });
    return { operation: updated, duplicate: true };
  }

  const sanitizedPayload = sanitizeOfflinePayload(input.payloadJson ?? {});
  const payloadHash = hashOfflinePayload(sanitizedPayload);
  const operation = await repo.create({
    storeId: input.storeId,
    terminalId: input.terminalId,
    actorId: input.actorId ?? null,
    operationType: input.operationType,
    operationCategory: policy.category,
    payloadJson: sanitizedPayload,
    payloadHash,
    idempotencyKey: input.idempotencyKey,
    status: "queued",
    replayAttempts: 0,
    lastReplayAt: null,
    conflictReason: null,
    rejectionReason: null,
    duplicateCount: 0,
  });

  return { operation, duplicate: false };
}

export function classifyReplayConflict(
  operation: OfflineOperationRecord,
  context: ReplayValidationContext = {},
): ReplayConflictReason | null {
  const policy = getOfflineOperationPolicy(operation.operationType);
  if (!policy.allowedOffline || operation.operationCategory === "never_finalize_offline") return "regulated_or_financial_gate_blocked";

  const payload = operation.payloadJson;
  if (context.maxAgeMs && (context.now ?? new Date()).getTime() - operation.createdAt.getTime() > context.maxAgeMs) return "expired";
  if (payload.stockVersion != null && context.currentStockVersion != null && String(payload.stockVersion) !== String(context.currentStockVersion)) return "stale_stock";
  if (payload.priceVersion != null && context.currentPriceVersion != null && String(payload.priceVersion) !== String(context.currentPriceVersion)) return "stale_price";
  if (payload.customerVersion != null && context.currentCustomerVersion != null && String(payload.customerVersion) !== String(context.currentCustomerVersion)) return "customer_changed";
  if (payload.prescriptionVersion != null && context.currentPrescriptionVersion != null && String(payload.prescriptionVersion) !== String(context.currentPrescriptionVersion)) return "prescription_changed";

  if (context.providerResult) {
    try {
      assertProviderNotFakeSuccessful(context.providerResult);
    } catch {
      return "provider_unavailable";
    }
    if (["provider_unconfigured", "disabled", "failed", "demo_skipped", "skipped_demo", "preview_only"].includes(String(context.providerResult.status))) {
      return "provider_unavailable";
    }
  }

  return null;
}

export async function markOfflineOperationRejected(
  repository: OfflineQueueRepository,
  operationId: number,
  rejectionReason: string,
): Promise<OfflineOperationRecord> {
  return repository.update(operationId, { status: "rejected", rejectionReason });
}

export async function markOfflineOperationApplied(
  repository: OfflineQueueRepository,
  operationId: number,
): Promise<OfflineOperationRecord> {
  return repository.update(operationId, { status: "applied", conflictReason: null, rejectionReason: null });
}

export async function replayOfflineOperation(
  operationId: number,
  options: {
    repository?: OfflineQueueRepository;
    validationContext?: ReplayValidationContext;
    apply?: ReplayApplyHandler;
    recordEvent?: OfflineReplayEventWriter;
  } = {},
): Promise<OfflineOperationRecord> {
  const repo = options.repository ?? await getOfflineQueueRepository();
  if (!repo) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "offline queue storage unavailable" });

  const operation = await repo.findById(operationId);
  if (!operation) throw new TRPCError({ code: "NOT_FOUND", message: "offline operation not found" });
  if (operation.status === "applied" || operation.status === "rejected" || operation.status === "cancelled") return operation;

  const replaying = await repo.update(operation.id, {
    status: "replaying",
    replayAttempts: operation.replayAttempts + 1,
    lastReplayAt: new Date(),
  });

  const conflict = classifyReplayConflict(replaying, options.validationContext);
  if (conflict) {
    const failClosedStatuses: ReplayConflictReason[] = ["regulated_or_financial_gate_blocked", "provider_unavailable", "expired"];
    const outcome = failClosedStatuses.includes(conflict) ? "rejected" : "conflict";
    const updated = await repo.update(replaying.id, {
      status: outcome,
      conflictReason: conflict,
      rejectionReason: failClosedStatuses.includes(conflict) ? conflict : null,
    });
    await options.recordEvent?.({ operation: updated, outcome, reason: conflict });
    return updated;
  }

  if (!options.apply) {
    const updated = await repo.update(replaying.id, {
      status: "conflict",
      conflictReason: "online_validation_failed:no_apply_handler",
    });
    await options.recordEvent?.({ operation: updated, outcome: "conflict", reason: updated.conflictReason });
    return updated;
  }

  const result = await options.apply(replaying);
  if (!result.applied) {
    const updated = await repo.update(replaying.id, {
      status: "conflict",
      conflictReason: result.reason ?? "online_validation_failed",
    });
    await options.recordEvent?.({ operation: updated, outcome: "conflict", reason: updated.conflictReason });
    return updated;
  }

  const applied = await markOfflineOperationApplied(repo, replaying.id);
  await options.recordEvent?.({ operation: applied, outcome: "applied", reason: null });
  return applied;
}

export async function replayOfflineOperationsForStore(
  storeId: number,
  options: {
    repository?: OfflineQueueRepository;
    validationContext?: ReplayValidationContext;
    apply?: ReplayApplyHandler;
    recordEvent?: OfflineReplayEventWriter;
  } = {},
): Promise<OfflineOperationRecord[]> {
  const repo = options.repository ?? await getOfflineQueueRepository();
  if (!repo) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "offline queue storage unavailable" });
  const queued = await repo.listForStore(storeId, ["queued", "conflict"]);
  const results: OfflineOperationRecord[] = [];
  for (const operation of queued) {
    results.push(await replayOfflineOperation(operation.id, { ...options, repository: repo }));
  }
  return results;
}

export type OfflineQueueHealthSummary = {
  queuedCount: number;
  conflictCount: number;
  oldestQueuedAgeMs: number | null;
  highRiskBlockedCount: number;
};

export async function buildOfflineQueueHealthSummary(
  repositoryOrStoreId?: OfflineQueueRepository | number,
  maybeStoreId?: number,
): Promise<OfflineQueueHealthSummary> {
  const repository = typeof repositoryOrStoreId === "object" ? repositoryOrStoreId : await getOfflineQueueRepository();
  const storeId = typeof repositoryOrStoreId === "number" ? repositoryOrStoreId : maybeStoreId;
  if (!repository) return { queuedCount: 0, conflictCount: 0, oldestQueuedAgeMs: null, highRiskBlockedCount: 0 };
  const rows = await repository.listForStore(storeId ?? 0, ["queued", "conflict", "rejected"]);
  const scopedRows = storeId == null ? rows : rows.filter(row => row.storeId === storeId);
  const queuedRows = scopedRows.filter(row => row.status === "queued");
  const now = Date.now();
  const oldestQueuedAgeMs = queuedRows.length ? Math.max(...queuedRows.map(row => now - row.createdAt.getTime())) : null;
  return {
    queuedCount: queuedRows.length,
    conflictCount: scopedRows.filter(row => row.status === "conflict").length,
    oldestQueuedAgeMs,
    highRiskBlockedCount: scopedRows.filter(row => row.status === "rejected" && getOfflineOperationPolicy(row.operationType).highRisk).length,
  };
}

export async function buildOfflineQueueHealthSummaryFromDb(): Promise<OfflineQueueHealthSummary> {
  const db = await getDb();
  if (!db) return { queuedCount: 0, conflictCount: 0, oldestQueuedAgeMs: null, highRiskBlockedCount: 0 };
  const rows = await db.execute(sql`
    SELECT
      SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) AS queuedCount,
      SUM(CASE WHEN status = 'conflict' THEN 1 ELSE 0 END) AS conflictCount,
      TIMESTAMPDIFF(MICROSECOND, MIN(CASE WHEN status = 'queued' THEN createdAt ELSE NULL END), NOW(6)) / 1000 AS oldestQueuedAgeMs,
      SUM(CASE WHEN status = 'rejected' AND operationCategory = 'never_finalize_offline' THEN 1 ELSE 0 END) AS highRiskBlockedCount
    FROM offline_operation_queue
  `);
  const first = Array.isArray((rows as any)[0]) ? (rows as any)[0][0] : (rows as any)[0];
  return {
    queuedCount: Number(first?.queuedCount ?? 0),
    conflictCount: Number(first?.conflictCount ?? 0),
    oldestQueuedAgeMs: first?.oldestQueuedAgeMs == null ? null : Number(first.oldestQueuedAgeMs),
    highRiskBlockedCount: Number(first?.highRiskBlockedCount ?? 0),
  };
}
