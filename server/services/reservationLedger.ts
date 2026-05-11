import { and, eq, lte } from "drizzle-orm";
import { randomUUID } from "crypto";
import pino from "pino";
import { executeCommand, type CommandContext } from "./executeCommand";
import { withLock, makeLockKey } from "./stockLockService";
import { getCanonicalAvailability } from "./canonicalAvailability";
import { getDb } from "../db";
import { reservations, reservationLines, stockMovements, batchLedger } from "../../drizzle/schema";
import { ENV } from "../_core/env";

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

// ─── Types ────────────────────────────────────────────────────────────────────

export type ReservationState =
  | "active"
  | "pending_confirmation"
  | "confirmed"
  | "released"
  | "expired";

export type ReserveLine = {
  productId: number;
  variantId?: number | null;
  quantity: number;
};

export type BatchAllocation = {
  batchId: number;
  batchNo: string;
  quantity: number;
  expiryDate: Date;
};

export type ReserveInput = {
  storeId: number;
  customerId?: number | null;
  cartId?: number | null;
  lines: ReserveLine[];
  ttlSeconds?: number;
  idempotencyKey: string;
};

export type ReserveOutput = {
  reservationId: string;
  state: ReservationState;
  expiresAt: Date;
  lines: Array<{
    productId: number;
    variantId: number | null;
    batchAllocations: BatchAllocation[];
  }>;
};

export type ConfirmInput = {
  reservationId: string;
  saleId?: string;
  idempotencyKey: string;
};

export type ConfirmOutput = {
  reservationId: string;
  saleId: string | null;
  confirmedAt: Date;
};

export type ReleaseInput = {
  reservationId: string;
  reason?: string;
  idempotencyKey: string;
};

export type ReleaseOutput = {
  reservationId: string;
  releasedAt: Date;
};

export type ExpireInput = {
  reservationId: string;
  idempotencyKey: string;
};

export type ExpireOutput = {
  reservationId: string;
  expiredAt: Date;
};

export type ReservationRecord = {
  id: string;
  storeId: number;
  customerId: number | null;
  cartId: number | null;
  saleId: string | null;
  state: ReservationState;
  ttlSeconds: number;
  createdAt: Date;
  expiresAt: Date;
  confirmedAt: Date | null;
  releasedAt: Date | null;
  expiredAt: Date | null;
  commandLogId: string | null;
  idempotencyKey: string | null;
};

// ─── Custom Errors ────────────────────────────────────────────────────────────

export class InsufficientStockError extends Error {
  constructor(
    public readonly productId: number,
    public readonly requested: number,
    public readonly available: number,
  ) {
    super(
      `Insufficient stock for product ${productId}: requested ${requested}, available ${available}`,
    );
    this.name = "InsufficientStockError";
  }
}

export class ReservationNotFoundError extends Error {
  constructor(reservationId: string) {
    super(`Reservation not found: ${reservationId}`);
    this.name = "ReservationNotFoundError";
  }
}

export class ReservationExpiredError extends Error {
  constructor(reservationId: string) {
    super(`Reservation ${reservationId} has expired`);
    this.name = "ReservationExpiredError";
  }
}

export class IllegalReservationStateError extends Error {
  constructor(reservationId: string, current: string, expected: string) {
    super(
      `Reservation ${reservationId} is in state "${current}", expected "${expected}"`,
    );
    this.name = "IllegalReservationStateError";
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function loadReservation(
  tx: Awaited<ReturnType<typeof getDb>>,
  reservationId: string,
) {
  if (!tx) throw new ReservationNotFoundError(reservationId);
  const rows = await (tx as any)
    .select()
    .from(reservations)
    .where(eq(reservations.id, reservationId))
    .limit(1);
  if (!rows || rows.length === 0) throw new ReservationNotFoundError(reservationId);
  return rows[0] as ReservationRecord;
}

async function loadReservationLines(
  tx: Awaited<ReturnType<typeof getDb>>,
  reservationId: string,
) {
  if (!tx) return [];
  return (tx as any)
    .select()
    .from(reservationLines)
    .where(eq(reservationLines.reservationId, reservationId));
}

// ─── reserve ─────────────────────────────────────────────────────────────────

export async function reserve(
  input: ReserveInput,
  context: CommandContext,
): Promise<ReserveOutput> {
  const ttlSeconds = Math.min(
    input.ttlSeconds ?? ENV.reservationTtlSeconds,
    ENV.reservationTtlSeconds,
  );

  // Sort lines by productId (deterministic lock ordering prevents deadlocks).
  const sortedLines = [...input.lines].sort((a, b) => {
    if (a.productId !== b.productId) return a.productId - b.productId;
    return (a.variantId ?? 0) - (b.variantId ?? 0);
  });

  // Acquire advisory locks for all unique (storeId, productId, variantId) combos
  // before entering executeCommand. This prevents deadlocks and ensures serial
  // allocation within the same store+product.
  const lockKeys = Array.from(
    new Set(sortedLines.map((l) => makeLockKey(input.storeId, l.productId, l.variantId))),
  );

  return withLock(lockKeys[0]!, async () => {
    // Nested locks for multi-SKU reservations (sorted so deadlock-free).
    const runWithRemainingLocks = async (
      idx: number,
    ): Promise<ReserveOutput> => {
      if (idx >= lockKeys.length) {
        return executeReserveCommand(input, context, ttlSeconds, sortedLines);
      }
      return withLock(lockKeys[idx]!, () => runWithRemainingLocks(idx + 1));
    };

    return runWithRemainingLocks(1);
  });
}

async function executeReserveCommand(
  input: ReserveInput,
  context: CommandContext,
  ttlSeconds: number,
  sortedLines: ReserveLine[],
): Promise<ReserveOutput> {
  return executeCommand<ReserveInput, ReserveOutput>({
    name: "reservation.reserve",
    version: 1,
    idempotencyKey: input.idempotencyKey,
    input,
    context,
    sloName: "trpc.reservation.reserve.p99",
    handler: async (_input, tx, _ctx) => {
      const reservationId = randomUUID();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

      const allocationsByLine: Array<{
        productId: number;
        variantId: number | null;
        batchAllocations: BatchAllocation[];
      }> = [];

      // Gather all reservation_lines rows to insert.
      const lineRows: Array<{
        id: string;
        reservationId: string;
        productId: number;
        batchId: number;
        variantId: number | null;
        quantity: number;
        expiryDate: string;
      }> = [];

      for (const line of sortedLines) {
        // Get FEFO-ordered availability for this product.
        const avail = await getCanonicalAvailability(
          line.productId,
          input.storeId,
          line.variantId,
        );

        if (avail.totalSellable < line.quantity) {
          throw new InsufficientStockError(
            line.productId,
            line.quantity,
            avail.totalSellable,
          );
        }

        // Allocate from FEFO-ordered batches.
        let remaining = line.quantity;
        const batchAllocations: BatchAllocation[] = [];

        for (const batch of avail.batches) {
          if (remaining <= 0) break;
          if (batch.sellable <= 0) continue;
          const take = Math.min(batch.sellable, remaining);
          remaining -= take;

          const expiryStr = batch.expiryDate instanceof Date
            ? batch.expiryDate.toISOString().slice(0, 10)
            : String(batch.expiryDate);

          lineRows.push({
            id: randomUUID(),
            reservationId,
            productId: line.productId,
            batchId: batch.batchId,
            variantId: line.variantId ?? null,
            quantity: take,
            expiryDate: expiryStr,
          });

          batchAllocations.push({
            batchId: batch.batchId,
            batchNo: batch.batchNo,
            quantity: take,
            expiryDate: batch.expiryDate,
          });
        }

        if (remaining > 0) {
          // Shouldn't happen given sellable check above, but guard.
          throw new InsufficientStockError(
            line.productId,
            line.quantity,
            line.quantity - remaining,
          );
        }

        allocationsByLine.push({
          productId: line.productId,
          variantId: line.variantId ?? null,
          batchAllocations,
        });
      }

      // Insert reservation header.
      await (tx as any).insert(reservations).values({
        id: reservationId,
        storeId: input.storeId,
        customerId: input.customerId ?? null,
        cartId: input.cartId ?? null,
        saleId: null,
        state: "active",
        ttlSeconds,
        createdAt: now,
        expiresAt,
        idempotencyKey: input.idempotencyKey,
      });

      // Insert all reservation_lines.
      if (lineRows.length > 0) {
        await (tx as any).insert(reservationLines).values(lineRows);
      }

      const output: ReserveOutput = {
        reservationId,
        state: "active",
        expiresAt,
        lines: allocationsByLine,
      };

      return { output, sideEffects: [] };
    },
  });
}

// ─── confirm ─────────────────────────────────────────────────────────────────

export async function confirm(
  input: ConfirmInput,
  context: CommandContext,
): Promise<ConfirmOutput> {
  return executeCommand<ConfirmInput, ConfirmOutput>({
    name: "reservation.confirm",
    version: 1,
    idempotencyKey: input.idempotencyKey,
    input,
    context,
    sloName: "trpc.reservation.confirm.p99",
    handler: async (_input, tx, _ctx) => {
      const reservation = await loadReservation(tx, input.reservationId);

      // Guard: must be active.
      if (reservation.state !== "active") {
        if (reservation.state === "confirmed") {
          throw new IllegalReservationStateError(
            input.reservationId,
            reservation.state,
            "active",
          );
        }
        throw new IllegalReservationStateError(
          input.reservationId,
          reservation.state,
          "active",
        );
      }

      // Guard: must not be expired.
      if (reservation.expiresAt < new Date()) {
        throw new ReservationExpiredError(input.reservationId);
      }

      const lines = await loadReservationLines(tx, input.reservationId);
      const confirmedAt = new Date();

      // For each reservation_line, write a stock_movement (sale_fulfil) and
      // decrement batchLedger.qtyOnHand to reflect physical consumption.
      for (const line of lines) {
        const batches = await (tx as any)
          .select()
          .from(batchLedger)
          .where(eq(batchLedger.id, line.batchId))
          .limit(1);

        const batch = batches?.[0];
        if (!batch) continue;

        const qtyBefore = Number(batch.qtyOnHand ?? 0);
        const qtyAfter = Math.max(0, qtyBefore - line.quantity);

        await (tx as any)
          .update(batchLedger)
          .set({ qtyOnHand: qtyAfter })
          .where(eq(batchLedger.id, line.batchId));

        await (tx as any).insert(stockMovements).values({
          batchId: line.batchId,
          storeId: reservation.storeId,
          movementType: "sale_fulfil",
          qty: -line.quantity,
          qtyBefore,
          qtyAfter,
          referenceType: "reservation",
          referenceId: null,
          reason: `Reservation confirmed: ${input.reservationId}`,
          performedBy: Number(context.actorUserId ?? 0),
        });
      }

      // Transition reservation state.
      await (tx as any)
        .update(reservations)
        .set({
          state: "confirmed",
          confirmedAt,
          saleId: input.saleId ?? null,
        })
        .where(eq(reservations.id, input.reservationId));

      const output: ConfirmOutput = {
        reservationId: input.reservationId,
        saleId: input.saleId ?? null,
        confirmedAt,
      };

      const affectedSkus = lines.map((l: any) => ({
        productId: l.productId,
        storeId: reservation.storeId,
      }));

      return {
        output,
        sideEffects: [
          {
            kind: "inventory.snapshot-refresh",
            payload: { storeId: reservation.storeId, skus: affectedSkus },
          },
        ],
      };
    },
  });
}

// ─── release ─────────────────────────────────────────────────────────────────

export async function release(
  input: ReleaseInput,
  context: CommandContext,
): Promise<ReleaseOutput> {
  return executeCommand<ReleaseInput, ReleaseOutput>({
    name: "reservation.release",
    version: 1,
    idempotencyKey: input.idempotencyKey,
    input,
    context,
    sloName: "trpc.reservation.release.p99",
    handler: async (_input, tx, _ctx) => {
      const reservation = await loadReservation(tx, input.reservationId);

      if (reservation.state !== "active" && reservation.state !== "pending_confirmation") {
        throw new IllegalReservationStateError(
          input.reservationId,
          reservation.state,
          "active or pending_confirmation",
        );
      }

      const releasedAt = new Date();

      await (tx as any)
        .update(reservations)
        .set({ state: "released", releasedAt })
        .where(eq(reservations.id, input.reservationId));

      return {
        output: { reservationId: input.reservationId, releasedAt },
        sideEffects: [],
      };
    },
  });
}

// ─── expire ──────────────────────────────────────────────────────────────────

export async function expire(
  input: ExpireInput,
  context: CommandContext,
): Promise<ExpireOutput> {
  return executeCommand<ExpireInput, ExpireOutput>({
    name: "reservation.expire",
    version: 1,
    idempotencyKey: input.idempotencyKey,
    input,
    context,
    sloName: "trpc.reservation.expire.p99",
    handler: async (_input, tx, _ctx) => {
      const reservation = await loadReservation(tx, input.reservationId);

      if (reservation.state !== "active") {
        throw new IllegalReservationStateError(
          input.reservationId,
          reservation.state,
          "active",
        );
      }

      if (reservation.expiresAt > new Date()) {
        throw new IllegalReservationStateError(
          input.reservationId,
          reservation.state,
          "active and past TTL",
        );
      }

      const expiredAt = new Date();

      await (tx as any)
        .update(reservations)
        .set({ state: "expired", expiredAt })
        .where(eq(reservations.id, input.reservationId));

      return {
        output: { reservationId: input.reservationId, expiredAt },
        sideEffects: [],
      };
    },
  });
}

// ─── Read helpers (no executeCommand; pure reads) ─────────────────────────────

export async function listActive(
  storeId: number,
  limit = 100,
): Promise<ReservationRecord[]> {
  const db = await getDb();
  if (!db) return [];
  return (db as any)
    .select()
    .from(reservations)
    .where(and(eq(reservations.storeId, storeId), eq(reservations.state, "active")))
    .limit(limit) as Promise<ReservationRecord[]>;
}

export async function listByCustomer(
  customerId: number,
  limit = 100,
): Promise<ReservationRecord[]> {
  const db = await getDb();
  if (!db) return [];
  return (db as any)
    .select()
    .from(reservations)
    .where(eq(reservations.customerId, customerId))
    .limit(limit) as Promise<ReservationRecord[]>;
}

export async function getById(
  reservationId: string,
): Promise<ReservationRecord | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await (db as any)
    .select()
    .from(reservations)
    .where(eq(reservations.id, reservationId))
    .limit(1);
  return rows?.[0] ?? null;
}
