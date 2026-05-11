import { createHash } from "crypto";
import pino from "pino";
import { desc } from "drizzle-orm";
import { getDb } from "../db";
import { auditLogChain } from "../../drizzle/schema";

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });

export type ChainedAuditPayload = {
  auditLogId?: number | null;
  action: string;
  entityType: string;
  entityId: string | number | null;
  actorUserId?: number | null;
  beforeJson?: unknown;
  afterJson?: unknown;
  ts?: Date;
};

// Stable canonicalization matching executeCommand.ts _testOnlyCanonicalize.
// MUST stay bit-for-bit identical to that implementation.
export function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(value as Record<string, unknown>).sort()) {
    sorted[k] = canonicalize((value as Record<string, unknown>)[k]);
  }
  return sorted;
}

function computeRowHash(prevHash: string, payload: unknown): string {
  return createHash("sha256")
    .update(prevHash + JSON.stringify(canonicalize(payload)))
    .digest("hex");
}

function buildHashedPayload(payload: ChainedAuditPayload, ts: Date): Record<string, unknown> {
  return {
    auditLogId: payload.auditLogId ?? null,
    action: payload.action,
    entityType: payload.entityType,
    entityId: payload.entityId,
    actorUserId: payload.actorUserId ?? null,
    beforeJson: payload.beforeJson ?? null,
    afterJson: payload.afterJson ?? null,
    ts: ts.toISOString(),
  };
}

export async function appendChainedAudit(payload: ChainedAuditPayload): Promise<{
  sequenceNumber: number;
  rowHash: string;
}> {
  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const db = await getDb();
      if (!db) {
        logger.error({ msg: "auditHashChain: db unavailable, chain append skipped" });
        return { sequenceNumber: -1, rowHash: "" };
      }

      const [latest] = await db
        .select()
        .from(auditLogChain)
        .orderBy(desc(auditLogChain.sequenceNumber))
        .limit(1);

      const prevHash = latest?.rowHash ?? "0000000000000000000000000000000000000000000000000000000000000000";
      const nextSeq = (latest?.sequenceNumber ?? -1) + 1;
      const ts = payload.ts ?? new Date();
      const hashedPayload = buildHashedPayload(payload, ts);
      const rowHash = computeRowHash(prevHash, hashedPayload);

      await db.insert(auditLogChain).values({
        auditLogId: payload.auditLogId ?? null,
        sequenceNumber: nextSeq,
        prevHash,
        rowHash,
        hashedPayload,
      });

      return { sequenceNumber: nextSeq, rowHash };
    } catch (err: unknown) {
      const isUniqueViolation =
        err instanceof Error && (err.message.includes("uq_audit_chain_sequence") || err.message.includes("ER_DUP_ENTRY"));
      if (isUniqueViolation && attempt < MAX_RETRIES - 1) {
        logger.warn({ attempt, msg: "auditHashChain: sequence conflict, retrying" });
        continue;
      }
      logger.error({ err, msg: "auditHashChain: append failed after retries" });
      return { sequenceNumber: -1, rowHash: "" };
    }
  }
  return { sequenceNumber: -1, rowHash: "" };
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
    return { verified: false, rowsChecked: 0, firstBreakAt: -1, firstBreakReason: "db unavailable", lastSequenceNumber: -1 };
  }

  const limit = options?.maxRows ?? 100_000;

  const rows = await db
    .select()
    .from(auditLogChain)
    .orderBy(auditLogChain.sequenceNumber)
    .limit(limit);

  const filtered = rows.filter((r) => {
    if (options?.fromSequence !== undefined && r.sequenceNumber < options.fromSequence) return false;
    if (options?.toSequence !== undefined && r.sequenceNumber > options.toSequence) return false;
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

      // Check sequence continuity first — a gap means a row was deleted.
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
          firstBreakReason: `prev_hash mismatch at sequence ${row.sequenceNumber}: expected ${prevHash}, got ${row.prevHash}`,
          lastSequenceNumber: filtered[filtered.length - 1].sequenceNumber,
        };
      }
    }

    // Skip hash recomputation for genesis row (sequence 0) since DB inserted it via SHA2()
    if (row.sequenceNumber > 0) {
      const recomputed = computeRowHash(row.prevHash, row.hashedPayload);
      if (recomputed !== row.rowHash) {
        return {
          verified: false,
          rowsChecked,
          firstBreakAt: row.sequenceNumber,
          firstBreakReason: `row_hash mismatch at sequence ${row.sequenceNumber}: stored hash does not match recomputed hash`,
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

export async function getChainStats(): Promise<{
  totalRows: number;
  lastVerifiedAt: Date | null;
  lastVerifiedSequence: number | null;
  oldestRow: { sequenceNumber: number; createdAt: Date } | null;
  newestRow: { sequenceNumber: number; createdAt: Date } | null;
}> {
  const db = await getDb();
  if (!db) {
    return { totalRows: 0, lastVerifiedAt: null, lastVerifiedSequence: null, oldestRow: null, newestRow: null };
  }

  // Use two ordered queries (asc/desc) so the mock can handle the full chainable pattern.
  const allRows = await db
    .select()
    .from(auditLogChain)
    .orderBy(auditLogChain.sequenceNumber)
    .limit(2_000_000);

  const oldest = allRows[0] ?? null;
  const newest = allRows[allRows.length - 1] ?? null;

  return {
    totalRows: allRows.length,
    lastVerifiedAt: null,
    lastVerifiedSequence: null,
    oldestRow: oldest ? { sequenceNumber: oldest.sequenceNumber, createdAt: oldest.createdAt } : null,
    newestRow: newest ? { sequenceNumber: newest.sequenceNumber, createdAt: newest.createdAt } : null,
  };
}
