import { and, eq, lt, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";
import { logAudit } from "./audit";
import { appendCommercialEventBestEffort } from "./commercialLifecycle";
import { getCanonicalAvailability } from "./reservationService";

export const RESERVATION_STATUSES = [
  "active",
  "consumed",
  "released",
  "expired",
  "cancelled",
  "failed",
] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];
export type TerminalReservationStatus = Exclude<ReservationStatus, "active">;

export type ReservationRecord = {
  id: string | number;
  storeId: number;
  productId: number;
  variantId?: number | null;
  skuId?: number | null;
  batchId?: number | null;
  orderId?: number | null;
  cartId?: number | null;
  qty: number;
  qtyReserved?: number;
  status: ReservationStatus;
  releaseReason?: string | null;
  expiresAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
  consumedAt?: Date | null;
  fulfilledAt?: Date | null;
  cancelledAt?: Date | null;
  lastTransitionKey?: string | null;
};

export type ReservationMutationInput = {
  id?: string | number;
  orderId?: number;
  cartId?: number;
  storeId?: number;
  productId?: number;
  statusReason?: string;
  releaseReason?: string;
  idempotencyKey: string;
  correlationId?: string | null;
  ctx?: any;
};

export type CreateReservationInput = {
  storeId: number;
  productId: number;
  variantId?: number | null;
  skuId?: number | null;
  batchId?: number | null;
  orderId?: number | null;
  cartId?: number | null;
  qty: number;
  expiresAt?: Date | null;
  idempotencyKey: string;
  correlationId?: string | null;
  ctx?: any;
};

export type ReservationTransitionResult = {
  ok: boolean;
  status: ReservationStatus;
  idempotent: boolean;
  reason?: string;
  reservation?: ReservationRecord;
};

const TERMINAL_STATUSES = new Set<ReservationStatus>([
  "consumed",
  "released",
  "expired",
  "cancelled",
  "failed",
]);
const IDEMPOTENT_TERMINALS = new Set<ReservationStatus>([
  "released",
  "expired",
  "cancelled",
  "failed",
]);

function requireIdempotencyKey(key: string | null | undefined) {
  if (!key || !String(key).trim()) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Reservation lifecycle mutations require a non-empty idempotency key",
    });
  }
  return String(key);
}

function reservationRef(input: {
  id?: string | number | null;
  orderId?: number | null;
  cartId?: number | null;
  storeId?: number | null;
  productId?: number | null;
}) {
  if (input.id != null) return String(input.id);
  if (input.orderId != null) return `order:${input.orderId}`;
  if (input.cartId != null) return `cart:${input.cartId}`;
  if (input.storeId != null && input.productId != null)
    return `store:${input.storeId}:product:${input.productId}`;
  return randomUUID();
}

export function evaluateReservationTransition(
  current: ReservationStatus,
  target: TerminalReservationStatus,
  input: { idempotencyKey: string; lastTransitionKey?: string | null }
): ReservationTransitionResult {
  const idempotencyKey = requireIdempotencyKey(input.idempotencyKey);
  if (current === "active")
    return { ok: true, status: target, idempotent: false };
  if (current === target && IDEMPOTENT_TERMINALS.has(target))
    return {
      ok: true,
      status: target,
      idempotent: true,
      reason: "terminal_transition_already_applied",
    };
  if (
    current === "consumed" &&
    target === "consumed" &&
    input.lastTransitionKey === idempotencyKey
  ) {
    return {
      ok: true,
      status: "consumed",
      idempotent: true,
      reason: "consume_already_applied_for_same_idempotency_key",
    };
  }
  return {
    ok: false,
    status: current,
    idempotent: false,
    reason: `invalid reservation transition ${current} -> ${target}`,
  };
}

async function requireDb() {
  const { getDb } = await import("../db");
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "DB unavailable",
    });
  return db;
}

function variantFilter(table: any, variantId?: number | null) {
  return variantId == null ? sql`1=1` : eq(table.variantId, variantId);
}

export async function assertAvailableForReservation(input: {
  storeId: number;
  productId: number;
  variantId?: number | null;
  qty: number;
}) {
  if (!Number.isInteger(input.qty) || input.qty <= 0)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Reservation quantity must be a positive integer",
    });
  const availability = await getCanonicalAvailability(
    input.storeId,
    input.productId,
    input.variantId
  );
  if (availability.availableQty < input.qty) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Insufficient available stock after active reservations",
    });
  }
  return availability;
}

async function auditReservation(
  action: string,
  input: {
    ref: string;
    entityId?: number | null;
    payload: Record<string, unknown>;
    ctx?: any;
  }
) {
  await logAudit(
    {
      action,
      entityType: "stock_reservation",
      entityId: input.entityId ?? null,
      entityRef: input.ref,
      afterJson: input.payload,
    },
    input.ctx
  );
}

async function appendReservationEvent(input: {
  eventType: string;
  reservationRef: string;
  reservationId?: string | number | null;
  orderId?: number | null;
  storeId?: number | null;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  correlationId?: string | null;
  ctx?: any;
}) {
  await appendCommercialEventBestEffort({
    aggregateType: "reservation",
    aggregateId: input.reservationRef,
    eventType: input.eventType,
    actorType: input.ctx?.user ? "staff" : "system",
    actorId: input.ctx?.user?.id ?? null,
    storeId: input.storeId ?? null,
    orderId: input.orderId ?? null,
    reservationId:
      input.reservationId != null ? String(input.reservationId) : null,
    eventPayload: input.payload,
    idempotencyKey: input.idempotencyKey,
    correlationId: input.correlationId ?? input.ctx?.requestId ?? null,
  });
}

export async function createReservation(input: CreateReservationInput) {
  const idempotencyKey = requireIdempotencyKey(input.idempotencyKey);
  const db = await requireDb();
  const { stockReservations } = await import("../../drizzle/schema");
  await assertAvailableForReservation(input);
  const expiresAt =
    input.expiresAt === undefined
      ? new Date(Date.now() + 15 * 60 * 1000)
      : input.expiresAt;
  const [row] = await db.insert(stockReservations).values({
    batchId: input.batchId ?? null,
    orderId: input.orderId ?? null,
    cartId: input.cartId ?? null,
    productId: input.productId,
    variantId: input.variantId ?? null,
    skuId: input.skuId ?? null,
    storeId: input.storeId,
    qty: input.qty,
    qtyReserved: input.qty,
    status: "active",
    expiresAt,
  });
  const id = (row as { insertId?: number })?.insertId;
  if (!id)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Reservation insert did not return a durable id",
    });
  const ref = String(id);
  const payload = { ...input, id, status: "active", expiresAt };
  await auditReservation("reservation.created", {
    ref,
    entityId: id,
    payload,
    ctx: input.ctx,
  });
  await appendReservationEvent({
    eventType: "reservation_created",
    reservationRef: ref,
    reservationId: id,
    orderId: input.orderId ?? null,
    storeId: input.storeId,
    payload,
    idempotencyKey,
    correlationId: input.correlationId,
    ctx: input.ctx,
  });
  return {
    ok: true as const,
    id,
    status: "active" as const,
    expiresAt,
    idempotencyKey,
  };
}

function timestampFor(status: TerminalReservationStatus, at: Date) {
  if (status === "consumed") return { fulfilledAt: at };
  if (status === "cancelled") return { cancelledAt: at };
  return {};
}

async function findReservation(input: ReservationMutationInput) {
  const db = await requireDb();
  const { stockReservations } = await import("../../drizzle/schema");
  const conds = [];
  if (input.id != null) conds.push(eq(stockReservations.id, Number(input.id)));
  if (input.orderId != null)
    conds.push(eq(stockReservations.orderId, input.orderId));
  if (input.cartId != null)
    conds.push(eq(stockReservations.cartId, input.cartId));
  if (input.storeId != null)
    conds.push(eq(stockReservations.storeId, input.storeId));
  if (input.productId != null)
    conds.push(eq(stockReservations.productId, input.productId));
  if (!conds.length)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Reservation lookup requires id, orderId, cartId, or store/product reference",
    });
  const rows = await db
    .select()
    .from(stockReservations)
    .where(and(...conds))
    .limit(1);
  return rows[0] ?? null;
}

async function transitionReservation(
  input: ReservationMutationInput,
  target: TerminalReservationStatus,
  defaultReason: string
): Promise<ReservationTransitionResult> {
  const idempotencyKey = requireIdempotencyKey(input.idempotencyKey);
  const db = await requireDb();
  const { stockReservations } = await import("../../drizzle/schema");
  const existing = (await findReservation(input)) as any;
  if (!existing)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Reservation not found for lifecycle transition",
    });
  const ref = reservationRef(existing);
  const lastTransitionKey =
    typeof existing.releaseReason === "string" &&
    existing.releaseReason.includes(`key=${idempotencyKey}`)
      ? idempotencyKey
      : null;
  const decision = evaluateReservationTransition(existing.status, target, {
    idempotencyKey,
    lastTransitionKey,
  });
  if (!decision.ok)
    throw new TRPCError({
      code: "CONFLICT",
      message: decision.reason ?? "Invalid reservation lifecycle transition",
    });
  if (decision.idempotent) return { ...decision, reservation: existing };

  const at = new Date();
  const reason = input.releaseReason ?? input.statusReason ?? defaultReason;
  const releaseReason = `${reason}; key=${idempotencyKey}`;
  await db
    .update(stockReservations)
    .set({
      status: target,
      releaseReason,
      updatedAt: at,
      ...timestampFor(target, at),
    })
    .where(
      and(
        eq(stockReservations.id, existing.id),
        eq(stockReservations.status, "active")
      )
    );
  const changed = (await findReservation({
    id: existing.id,
    idempotencyKey,
  })) as any;
  if (!changed || changed.status !== target)
    throw new TRPCError({
      code: "CONFLICT",
      message: `Reservation transition to ${target} was not durably applied`,
    });
  const eventType = `reservation_${target}`;
  const payload = {
    reservationId: existing.id,
    from: existing.status,
    to: target,
    reason,
    idempotencyKey,
  };
  await auditReservation(`reservation.${target}`, {
    ref,
    entityId: existing.id,
    payload,
    ctx: input.ctx,
  });
  await appendReservationEvent({
    eventType,
    reservationRef: ref,
    reservationId: existing.id,
    orderId: existing.orderId ?? input.orderId ?? null,
    storeId: existing.storeId ?? input.storeId ?? null,
    payload,
    idempotencyKey,
    correlationId: input.correlationId,
    ctx: input.ctx,
  });
  return {
    ok: true,
    status: target,
    idempotent: false,
    reservation: changed,
    reason,
  };
}

export function consumeReservation(input: ReservationMutationInput) {
  return transitionReservation(input, "consumed", "reservation_consumed");
}
export function releaseReservation(input: ReservationMutationInput) {
  return transitionReservation(input, "released", "manual_release");
}
export function expireReservation(input: ReservationMutationInput) {
  return transitionReservation(input, "expired", "reservation_expired");
}
export function cancelReservation(input: ReservationMutationInput) {
  return transitionReservation(input, "cancelled", "reservation_cancelled");
}
export function failReservation(input: ReservationMutationInput) {
  return transitionReservation(input, "failed", "reservation_failed");
}

export async function getReservationStatus(
  input: Omit<ReservationMutationInput, "idempotencyKey">
) {
  return findReservation({ ...input, idempotencyKey: "status-read" });
}

export async function reconcileExpiredReservations(
  now = new Date(),
  input?: { idempotencyKey?: string; ctx?: any }
) {
  const idempotencyKey = requireIdempotencyKey(
    input?.idempotencyKey ??
      `reservation:reconcile-expired:${now.toISOString()}`
  );
  const db = await requireDb();
  const { stockReservations } = await import("../../drizzle/schema");
  const expiredRows = await db
    .select()
    .from(stockReservations)
    .where(
      and(
        eq(stockReservations.status, "active"),
        lt(stockReservations.expiresAt, now)
      )
    );
  for (const row of expiredRows as any[]) {
    await expireReservation({
      id: row.id,
      releaseReason: "expiresAt elapsed",
      idempotencyKey: `${idempotencyKey}:${row.id}`,
      ctx: input?.ctx,
    });
  }
  return { ok: true, expiredCount: expiredRows.length, staleActiveCount: 0 };
}

export async function getReservationAuditSummary(
  input: Omit<ReservationMutationInput, "idempotencyKey">
) {
  const reservation = await getReservationStatus(input);
  if (!reservation) return { found: false, events: [] as unknown[] };
  return {
    found: true,
    reservation,
    terminal: TERMINAL_STATUSES.has((reservation as any).status),
    auditRef: reservationRef(reservation as any),
  };
}

export function createInMemoryReservationLifecycleStore(
  seed: ReservationRecord[] = []
) {
  const reservations: ReservationRecord[] = seed.map(r => ({
    ...r,
    qtyReserved: r.qtyReserved ?? r.qty,
    lastTransitionKey: r.lastTransitionKey ?? null,
  }));
  const events: Array<{
    type: string;
    reservationId: string | number;
    idempotencyKey: string;
    status: ReservationStatus;
  }> = [];
  const find = (input: {
    id?: string | number;
    orderId?: number;
    cartId?: number;
  }) =>
    reservations.find(
      r =>
        (input.id != null && r.id === input.id) ||
        (input.orderId != null && r.orderId === input.orderId) ||
        (input.cartId != null && r.cartId === input.cartId)
    );
  const transition = (
    input: ReservationMutationInput,
    target: TerminalReservationStatus
  ) => {
    const key = requireIdempotencyKey(input.idempotencyKey);
    const reservation = find(input);
    if (!reservation)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Reservation not found for lifecycle transition",
      });
    const decision = evaluateReservationTransition(reservation.status, target, {
      idempotencyKey: key,
      lastTransitionKey: reservation.lastTransitionKey,
    });
    if (!decision.ok)
      throw new TRPCError({
        code: "CONFLICT",
        message: decision.reason ?? "Invalid reservation lifecycle transition",
      });
    if (!decision.idempotent) {
      reservation.status = target;
      reservation.releaseReason =
        input.releaseReason ?? input.statusReason ?? target;
      reservation.updatedAt = new Date();
      reservation.lastTransitionKey = key;
      events.push({
        type: `reservation_${target}`,
        reservationId: reservation.id,
        idempotencyKey: key,
        status: target,
      });
    }
    return { ...decision, reservation };
  };
  return {
    reservations,
    events,
    create(input: CreateReservationInput & { id?: string | number }) {
      const key = requireIdempotencyKey(input.idempotencyKey);
      const id = input.id ?? randomUUID();
      const reservation: ReservationRecord = {
        id,
        storeId: input.storeId,
        productId: input.productId,
        variantId: input.variantId ?? null,
        skuId: input.skuId ?? null,
        batchId: input.batchId ?? null,
        orderId: input.orderId ?? null,
        cartId: input.cartId ?? null,
        qty: input.qty,
        qtyReserved: input.qty,
        status: "active",
        expiresAt: input.expiresAt ?? null,
        lastTransitionKey: null,
      };
      reservations.push(reservation);
      events.push({
        type: "reservation_created",
        reservationId: id,
        idempotencyKey: key,
        status: "active",
      });
      return reservation;
    },
    consume: (input: ReservationMutationInput) => transition(input, "consumed"),
    release: (input: ReservationMutationInput) => transition(input, "released"),
    expire: (input: ReservationMutationInput) => transition(input, "expired"),
    cancel: (input: ReservationMutationInput) => transition(input, "cancelled"),
    fail: (input: ReservationMutationInput) => transition(input, "failed"),
    reconcileExpired(now = new Date()) {
      for (const reservation of reservations.filter(
        r => r.status === "active" && r.expiresAt && r.expiresAt < now
      )) {
        transition(
          {
            id: reservation.id,
            idempotencyKey: `memory-expire:${reservation.id}:${now.toISOString()}`,
            releaseReason: "expiresAt elapsed",
          },
          "expired"
        );
      }
      return {
        staleActiveCount: reservations.filter(
          r => r.status === "active" && r.expiresAt && r.expiresAt < now
        ).length,
      };
    },
  };
}
