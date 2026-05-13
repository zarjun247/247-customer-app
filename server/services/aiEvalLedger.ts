import { createHash } from "crypto";
import pino from "pino";
import { and, count, desc, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "../db";
import { aiEvalLedger, aiEvalOutcomes } from "../../drizzle/schema";

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });

export type SuggestionInput = {
  suggestionKind: string;
  scopeType: "customer" | "product" | "store" | "global";
  scopeId: string | null;
  inputSnapshot: unknown;
  outputPayload: unknown;
  modelVersion: string;
  generatedByUserId?: string | null;
  traceId?: string | null;
};

// Mirrors canonicalize from auditHashChain.ts — MUST stay bit-for-bit identical.
export function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(value).sort()) {
    sorted[k] = canonicalize((value as Record<string, unknown>)[k]);
  }
  return sorted;
}

function sha256(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

function computeRowHash(prevHash: string, payload: unknown): string {
  return sha256(prevHash + JSON.stringify(canonicalize(payload)));
}

function buildHashPayload(
  input: SuggestionInput,
  sequenceNumber: number,
  generatedAt: Date
) {
  return {
    sequenceNumber,
    suggestionKind: input.suggestionKind,
    scopeType: input.scopeType,
    scopeId: input.scopeId,
    inputHash: sha256(JSON.stringify(canonicalize(input.inputSnapshot))),
    outputPayload: input.outputPayload,
    modelVersion: input.modelVersion,
    generatedByUserId: input.generatedByUserId ?? null,
    traceId: input.traceId ?? null,
    generatedAt: generatedAt.toISOString(),
  };
}

export async function appendSuggestion(input: SuggestionInput): Promise<{
  sequenceNumber: number;
  rowHash: string;
  ledgerId: number;
}> {
  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const db = await getDb();
      if (!db) {
        logger.error("aiEvalLedger: db unavailable, suggestion append skipped");
        return { sequenceNumber: -1, rowHash: "", ledgerId: -1 };
      }

      const [latest] = await db
        .select()
        .from(aiEvalLedger)
        .orderBy(desc(aiEvalLedger.sequenceNumber))
        .limit(1);

      const prevHash =
        latest?.rowHash ??
        "0000000000000000000000000000000000000000000000000000000000000000";
      const nextSeq = (latest?.sequenceNumber ?? -1) + 1;
      const generatedAt = new Date();
      const inputHash = sha256(
        JSON.stringify(canonicalize(input.inputSnapshot))
      );
      const hashPayload = buildHashPayload(input, nextSeq, generatedAt);
      const rowHash = computeRowHash(prevHash, hashPayload);

      const result = await db.insert(aiEvalLedger).values({
        sequenceNumber: nextSeq,
        prevHash,
        rowHash,
        suggestionKind: input.suggestionKind,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        inputHash,
        inputSnapshot: input.inputSnapshot,
        outputPayload: input.outputPayload,
        modelVersion: input.modelVersion,
        generatedAt,
        generatedByUserId: input.generatedByUserId ?? null,
        traceId: input.traceId ?? null,
      });

      const ledgerId = Number(
        (result as unknown as { insertId: number }).insertId ?? 0
      );
      return { sequenceNumber: nextSeq, rowHash, ledgerId };
    } catch (err: unknown) {
      const isUniqueViolation =
        err instanceof Error &&
        (err.message.includes("uq_ai_eval_sequence") ||
          err.message.includes("uq_ai_eval_row_hash") ||
          err.message.includes("ER_DUP_ENTRY"));
      if (isUniqueViolation && attempt < MAX_RETRIES - 1) {
        logger.warn({ attempt }, "aiEvalLedger: sequence conflict, retrying");
        continue;
      }
      logger.error({ err }, "aiEvalLedger: append failed after retries");
      return { sequenceNumber: -1, rowHash: "", ledgerId: -1 };
    }
  }
  return { sequenceNumber: -1, rowHash: "", ledgerId: -1 };
}

export async function recordOutcome(input: {
  evalLedgerId: number;
  outcomeKind:
    | "accepted"
    | "rejected"
    | "ignored"
    | "modified"
    | "outcome_realized";
  outcomePayload?: unknown;
  recordedByUserId?: string | null;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(aiEvalOutcomes).values({
    evalLedgerId: input.evalLedgerId,
    outcomeKind: input.outcomeKind,
    outcomePayload: input.outcomePayload ?? null,
    recordedAt: new Date(),
    recordedByUserId: input.recordedByUserId ?? null,
  });
}

export async function verifyChain(options?: {
  fromSequence?: number;
  toSequence?: number;
  maxRows?: number;
}): Promise<{
  verified: boolean;
  rowsChecked: number;
  firstBreakAt?: number;
  firstBreakReason?: string;
  lastSequenceNumber: number;
}> {
  const db = await getDb();
  if (!db) {
    return {
      verified: false,
      rowsChecked: 0,
      firstBreakAt: -1,
      firstBreakReason: "db unavailable",
      lastSequenceNumber: -1,
    };
  }

  const limit = options?.maxRows ?? 100_000;
  const rows = await db
    .select()
    .from(aiEvalLedger)
    .orderBy(aiEvalLedger.sequenceNumber)
    .limit(limit);

  const filtered = rows.filter(r => {
    if (
      options?.fromSequence !== undefined &&
      r.sequenceNumber < options.fromSequence
    )
      return false;
    if (
      options?.toSequence !== undefined &&
      r.sequenceNumber > options.toSequence
    )
      return false;
    return true;
  });

  if (filtered.length === 0) {
    return { verified: true, rowsChecked: 0, lastSequenceNumber: -1 };
  }

  let rowsChecked = 0;
  let prevHash: string | null = null;

  for (let i = 0; i < filtered.length; i++) {
    const row = filtered[i];
    rowsChecked++;

    if (i > 0) {
      const prevRow = filtered[i - 1];
      if (row.sequenceNumber !== prevRow.sequenceNumber + 1) {
        return {
          verified: false,
          rowsChecked,
          firstBreakAt: row.sequenceNumber,
          firstBreakReason: `sequence gap between ${prevRow.sequenceNumber} and ${row.sequenceNumber}`,
          lastSequenceNumber: filtered[filtered.length - 1].sequenceNumber,
        };
      }
      if (prevHash !== null && row.prevHash !== prevHash) {
        return {
          verified: false,
          rowsChecked,
          firstBreakAt: row.sequenceNumber,
          firstBreakReason: `prev_hash mismatch at sequence ${row.sequenceNumber}`,
          lastSequenceNumber: filtered[filtered.length - 1].sequenceNumber,
        };
      }
    }

    // Skip hash recomputation for genesis row (sequence 0) — DB inserted it via SHA2()
    if (row.sequenceNumber > 0) {
      const hashPayload = buildHashPayload(
        {
          suggestionKind: row.suggestionKind,
          scopeType: row.scopeType as SuggestionInput["scopeType"],
          scopeId: row.scopeId ?? null,
          inputSnapshot: row.inputSnapshot,
          outputPayload: row.outputPayload,
          modelVersion: row.modelVersion,
          generatedByUserId: row.generatedByUserId,
          traceId: row.traceId,
        },
        row.sequenceNumber,
        row.generatedAt
      );
      const recomputed = computeRowHash(row.prevHash, hashPayload);
      if (recomputed !== row.rowHash) {
        return {
          verified: false,
          rowsChecked,
          firstBreakAt: row.sequenceNumber,
          firstBreakReason: `row_hash mismatch at sequence ${row.sequenceNumber}`,
          lastSequenceNumber: filtered[filtered.length - 1].sequenceNumber,
        };
      }
    }

    prevHash = row.rowHash;
  }

  return {
    verified: true,
    rowsChecked,
    lastSequenceNumber: filtered[filtered.length - 1].sequenceNumber,
  };
}

export async function getStats(): Promise<{
  totalSuggestions: number;
  totalOutcomes: number;
  byKind: Array<{
    kind: string;
    count: number;
    acceptedCount: number;
    rejectedCount: number;
    ignoredCount: number;
  }>;
  acceptanceRate: number;
  oldestRow: Date | null;
  newestRow: Date | null;
}> {
  const db = await getDb();
  if (!db) {
    return {
      totalSuggestions: 0,
      totalOutcomes: 0,
      byKind: [],
      acceptanceRate: 0,
      oldestRow: null,
      newestRow: null,
    };
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalSuggestionsRow,
    totalOutcomesRow,
    byKindRows,
    recentOutcomes,
    allRows,
  ] = await Promise.all([
    db.select({ total: count() }).from(aiEvalLedger),
    db.select({ total: count() }).from(aiEvalOutcomes),
    db
      .select({
        kind: aiEvalLedger.suggestionKind,
        total: count(),
        accepted: sql<number>`SUM(CASE WHEN EXISTS (SELECT 1 FROM ai_eval_outcomes o WHERE o.eval_ledger_id = ${aiEvalLedger.id} AND o.outcome_kind = 'accepted') THEN 1 ELSE 0 END)`,
        rejected: sql<number>`SUM(CASE WHEN EXISTS (SELECT 1 FROM ai_eval_outcomes o WHERE o.eval_ledger_id = ${aiEvalLedger.id} AND o.outcome_kind = 'rejected') THEN 1 ELSE 0 END)`,
        ignored: sql<number>`SUM(CASE WHEN EXISTS (SELECT 1 FROM ai_eval_outcomes o WHERE o.eval_ledger_id = ${aiEvalLedger.id} AND o.outcome_kind = 'ignored') THEN 1 ELSE 0 END)`,
      })
      .from(aiEvalLedger)
      .groupBy(aiEvalLedger.suggestionKind),
    db
      .select({ outcomeKind: aiEvalOutcomes.outcomeKind, total: count() })
      .from(aiEvalOutcomes)
      .where(gte(aiEvalOutcomes.recordedAt, thirtyDaysAgo))
      .groupBy(aiEvalOutcomes.outcomeKind),
    db
      .select()
      .from(aiEvalLedger)
      .orderBy(aiEvalLedger.sequenceNumber)
      .limit(2_000_000),
  ]);

  const acceptedCount =
    recentOutcomes.find(r => r.outcomeKind === "accepted")?.total ?? 0;
  const rejectedCount =
    recentOutcomes.find(r => r.outcomeKind === "rejected")?.total ?? 0;
  const denominator = Number(acceptedCount) + Number(rejectedCount);
  const acceptanceRate =
    denominator > 0 ? Number(acceptedCount) / denominator : 0;

  const oldest = allRows[0] ?? null;
  const newest = allRows[allRows.length - 1] ?? null;

  return {
    totalSuggestions: Number(totalSuggestionsRow[0]?.total ?? 0),
    totalOutcomes: Number(totalOutcomesRow[0]?.total ?? 0),
    byKind: byKindRows.map(r => ({
      kind: r.kind,
      count: Number(r.total),
      acceptedCount: Number(r.accepted),
      rejectedCount: Number(r.rejected),
      ignoredCount: Number(r.ignored),
    })),
    acceptanceRate,
    oldestRow: oldest ? oldest.generatedAt : null,
    newestRow: newest ? newest.generatedAt : null,
  };
}

export async function listSuggestions(options?: {
  suggestionKind?: string;
  scopeType?: string;
  scopeId?: string;
  limit?: number;
  offset?: number;
}): Promise<{
  records: Array<AiEvalLedgerRecord & { latestOutcome: string | null }>;
  total: number;
}> {
  const db = await getDb();
  if (!db) return { records: [], total: 0 };

  const conditions = [];
  if (options?.suggestionKind)
    conditions.push(
      sql`${aiEvalLedger.suggestionKind} = ${options.suggestionKind}`
    );
  if (options?.scopeType)
    conditions.push(sql`${aiEvalLedger.scopeType} = ${options.scopeType}`);
  if (options?.scopeId)
    conditions.push(sql`${aiEvalLedger.scopeId} = ${options.scopeId}`);

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  const [rows, totalRows] = await Promise.all([
    db
      .select()
      .from(aiEvalLedger)
      .where(where)
      .orderBy(desc(aiEvalLedger.generatedAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(aiEvalLedger).where(where),
  ]);

  // Fetch latest outcome for each ledger row
  const ledgerIds = rows.map(r => r.id);
  const latestOutcomeMap = new Map<number, string>();
  if (ledgerIds.length > 0) {
    const outcomes = await db
      .select()
      .from(aiEvalOutcomes)
      .where(inArray(aiEvalOutcomes.evalLedgerId, ledgerIds))
      .orderBy(desc(aiEvalOutcomes.recordedAt))
      .limit(ledgerIds.length * 10 + 100);
    for (const o of outcomes) {
      if (!latestOutcomeMap.has(o.evalLedgerId)) {
        latestOutcomeMap.set(o.evalLedgerId, o.outcomeKind);
      }
    }
  }

  return {
    records: rows.map(r => ({
      ...r,
      latestOutcome: latestOutcomeMap.get(r.id) ?? null,
    })),
    total: Number(totalRows[0]?.total ?? 0),
  };
}

type AiEvalLedgerRecord = {
  id: number;
  sequenceNumber: number;
  prevHash: string;
  rowHash: string;
  suggestionKind: string;
  scopeType: string;
  scopeId: string | null;
  inputHash: string;
  inputSnapshot: unknown;
  outputPayload: unknown;
  modelVersion: string;
  generatedAt: Date;
  generatedByUserId: string | null;
  traceId: string | null;
};
