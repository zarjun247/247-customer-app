import { desc, eq } from "drizzle-orm";
import { providerDeadLetters, providerOperationAttempts } from "../../drizzle/schema";
import { getDb } from "../db";
import type { ProviderRuntimeStatus } from "./providerRuntime";

export type ProviderAttemptInput = {
  provider: string;
  operation: string;
  idempotencyKey: string;
  status: ProviderRuntimeStatus;
  attemptNo: number;
  maxAttempts: number;
  retryable: boolean;
  nextRetryAt?: Date | null;
  deadLetterReason?: string | null;
  requestHash?: string | null;
  responseSummaryJson?: unknown;
  correlationId?: string | null;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
};

export type ProviderEventRecord = ProviderAttemptInput & { id: number; resolvedAt?: Date | null; createdAt: Date; updatedAt: Date };

const memoryAttempts: ProviderEventRecord[] = [];
const memoryDeadLetters: ProviderEventRecord[] = [];
let nextMemoryId = 1;

function toDbValues(input: ProviderAttemptInput) {
  return {
    provider: input.provider,
    operation: input.operation,
    idempotencyKey: input.idempotencyKey,
    status: input.status,
    attemptNo: input.attemptNo,
    maxAttempts: input.maxAttempts,
    retryable: input.retryable,
    nextRetryAt: input.nextRetryAt ?? null,
    deadLetterReason: input.deadLetterReason ?? null,
    requestHash: input.requestHash ?? null,
    responseSummaryJson: JSON.stringify(input.responseSummaryJson ?? {}),
    correlationId: input.correlationId ?? null,
    relatedEntityType: input.relatedEntityType ?? null,
    relatedEntityId: input.relatedEntityId ?? null,
  };
}

function pushMemory(target: ProviderEventRecord[], input: ProviderAttemptInput): ProviderEventRecord {
  const now = new Date();
  const record = { ...input, id: nextMemoryId++, createdAt: now, updatedAt: now, resolvedAt: null };
  target.push(record);
  return record;
}

export async function recordProviderAttempt(input: ProviderAttemptInput): Promise<ProviderEventRecord> {
  const db = await getDb();
  if (!db) return pushMemory(memoryAttempts, input);
  const [row] = await db.insert(providerOperationAttempts).values(toDbValues(input)).$returningId();
  return { ...input, id: row.id, createdAt: new Date(), updatedAt: new Date() };
}

export async function recordProviderDeadLetter(input: ProviderAttemptInput): Promise<ProviderEventRecord> {
  const db = await getDb();
  if (!db) return pushMemory(memoryDeadLetters, { ...input, status: "dead_letter" });
  const [row] = await db.insert(providerDeadLetters).values(toDbValues({ ...input, status: "dead_letter" })).$returningId();
  return { ...input, status: "dead_letter", id: row.id, createdAt: new Date(), updatedAt: new Date(), resolvedAt: null };
}

export async function listProviderDeadLetters(filters: { provider?: string; status?: ProviderRuntimeStatus; limit?: number } = {}) {
  const db = await getDb();
  if (!db) {
    return memoryDeadLetters
      .filter(row => (!filters.provider || row.provider === filters.provider) && (!filters.status || row.status === filters.status))
      .slice(0, filters.limit ?? 50);
  }
  const base = db.select().from(providerDeadLetters);
  const rows = filters.provider
    ? await base.where(eq(providerDeadLetters.provider, filters.provider)).orderBy(desc(providerDeadLetters.createdAt)).limit(filters.limit ?? 50)
    : await base.orderBy(desc(providerDeadLetters.createdAt)).limit(filters.limit ?? 50);
  return filters.status ? rows.filter(row => row.status === filters.status) : rows;
}

export async function markProviderDeadLetterResolved(id: number) {
  const db = await getDb();
  if (!db) {
    const row = memoryDeadLetters.find(item => item.id === id);
    if (row) {
      row.resolvedAt = new Date();
      row.updatedAt = new Date();
    }
    return row ?? null;
  }
  await db.update(providerDeadLetters).set({ resolvedAt: new Date(), updatedAt: new Date() }).where(eq(providerDeadLetters.id, id));
  return { id, resolvedAt: new Date() };
}

export async function buildProviderFailureReport() {
  const deadLetters = await listProviderDeadLetters({ limit: 500 });
  const countsByProvider = deadLetters.reduce<Record<string, number>>((acc, row) => {
    acc[row.provider] = (acc[row.provider] ?? 0) + 1;
    return acc;
  }, {});
  const countsByOperation = deadLetters.reduce<Record<string, number>>((acc, row) => {
    acc[row.operation] = (acc[row.operation] ?? 0) + 1;
    return acc;
  }, {});
  return { deadLetterCount: deadLetters.length, countsByProvider, countsByOperation };
}

export function clearProviderRuntimeMemoryForTests() {
  memoryAttempts.length = 0;
  memoryDeadLetters.length = 0;
  nextMemoryId = 1;
}
