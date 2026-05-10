import { eq } from "drizzle-orm";
import { providerDeadLetters, providerWebhookEvents, type ProviderWebhookEvent } from "../../drizzle/schema";

export type ProviderRetryStatus = "received" | "verified" | "retry_scheduled" | "dead_letter" | "processed" | "failed";

export type ProviderRetryProofState = {
  providerEventId: number;
  processingStatus: ProviderRetryStatus;
  attemptCount: number;
  maxAttempts: number;
  failureReason: string | null;
  deadLetter?: {
    providerEventId: number;
    failureReason: string | null;
    attemptCount: number;
    deadLetterClass: string;
    reviewStatus: "pending_review" | "resolved" | "replayed";
    reviewedBy?: string | null;
    reviewedAt?: Date | null;
    reviewNote?: string | null;
  };
};

const RETRY_TERMINAL_STATUSES = new Set(["processed", "ignored_duplicate", "unsupported_event"]);
const DEAD_LETTER_DUPLICATE_CODE = new Set(["ER_DUP_ENTRY", "SQLITE_CONSTRAINT_UNIQUE"]);

function errorHasDuplicateCode(error: any): boolean {
  if (!error || typeof error !== "object") return false;
  if (DEAD_LETTER_DUPLICATE_CODE.has(error.code)) return true;
  return errorHasDuplicateCode(error.cause) || errorHasDuplicateCode(error.originalError);
}

export function scheduleProviderRetryInMemory(state: ProviderRetryProofState, input: { reason: string }) {
  if (state.processingStatus === "dead_letter" || state.deadLetter) return { ...state, emittedSuccess: false as const };
  if (state.processingStatus === "processed") return { ...state, emittedSuccess: false as const };
  return {
    ...state,
    processingStatus: "retry_scheduled" as const,
    attemptCount: state.attemptCount + 1,
    failureReason: input.reason,
    emittedSuccess: false as const,
  };
}

export function deadLetterProviderEventInMemory(state: ProviderRetryProofState, input: { reason: string; deadLetterClass?: string }) {
  if (state.deadLetter) return { ...state, processingStatus: "dead_letter" as const, emittedSuccess: false as const, duplicateDeadLetter: true as const };
  return {
    ...state,
    processingStatus: "dead_letter" as const,
    failureReason: input.reason,
    deadLetter: {
      providerEventId: state.providerEventId,
      failureReason: input.reason,
      attemptCount: state.attemptCount,
      deadLetterClass: input.deadLetterClass ?? "max_retries_exceeded",
      reviewStatus: "pending_review" as const,
      reviewedBy: null,
      reviewedAt: null,
      reviewNote: null,
    },
    emittedSuccess: false as const,
    duplicateDeadLetter: false as const,
  };
}

export async function scheduleProviderEventRetry(db: any, input: { providerEventRowId: number; reason: string; retryDelayMs?: number; maxAttempts?: number }) {
  const [event] = await db.select().from(providerWebhookEvents).where(eq(providerWebhookEvents.id, input.providerEventRowId)).limit(1);
  if (!event) throw new Error("provider event not found");
  if (RETRY_TERMINAL_STATUSES.has(event.processingStatus) || event.processingStatus === "dead_letter") {
    return { status: event.processingStatus, attemptCount: Number(event.attemptCount ?? 0), scheduled: false, emittedSuccess: false as const };
  }

  const maxAttempts = input.maxAttempts ?? Number(event.maxAttempts ?? 3);
  const nextAttempt = Number(event.attemptCount ?? 0) + 1;
  const now = new Date();
  if (nextAttempt >= maxAttempts) {
    const dead = await moveProviderEventToDeadLetterOnce(db, { providerEvent: event, reason: input.reason, deadLetterClass: "max_retries_exceeded", attemptCount: nextAttempt });
    return { status: "dead_letter" as const, attemptCount: nextAttempt, scheduled: false, deadLetter: dead.deadLetter, duplicate: dead.duplicate, emittedSuccess: false as const };
  }

  await db.update(providerWebhookEvents).set({
    processingStatus: "retry_scheduled",
    attemptCount: nextAttempt,
    maxAttempts,
    nextRetryAt: new Date(now.getTime() + (input.retryDelayMs ?? 60_000)),
    lastAttemptAt: now,
    failureReason: input.reason,
  }).where(eq(providerWebhookEvents.id, input.providerEventRowId));

  return { status: "retry_scheduled" as const, attemptCount: nextAttempt, scheduled: true, emittedSuccess: false as const };
}

export async function moveProviderEventToDeadLetterOnce(db: any, input: { providerEvent: ProviderWebhookEvent; reason: string; deadLetterClass?: string; attemptCount?: number }) {
  const [existing] = await db.select().from(providerDeadLetters).where(eq(providerDeadLetters.providerEventId, input.providerEvent.id)).limit(1);
  if (existing) {
    await db.update(providerWebhookEvents).set({ processingStatus: "dead_letter", failureReason: input.reason }).where(eq(providerWebhookEvents.id, input.providerEvent.id));
    return { deadLetter: existing, duplicate: true, emittedSuccess: false as const };
  }

  try {
    const [result] = await db.insert(providerDeadLetters).values({
      providerEventId: input.providerEvent.id,
      provider: input.providerEvent.provider,
      eventType: input.providerEvent.eventType,
      paymentId: input.providerEvent.paymentId ?? null,
      orderId: input.providerEvent.orderId ?? null,
      refundId: input.providerEvent.refundId ?? null,
      rawPayloadHash: input.providerEvent.rawPayloadHash,
      failureReason: input.reason,
      attemptCount: input.attemptCount ?? Number(input.providerEvent.attemptCount ?? 0),
      deadLetterClass: input.deadLetterClass ?? "max_retries_exceeded",
      reviewStatus: "pending_review",
      reviewedBy: null,
      reviewedAt: null,
      reviewNote: null,
    });
    await db.update(providerWebhookEvents).set({ processingStatus: "dead_letter", failureReason: input.reason }).where(eq(providerWebhookEvents.id, input.providerEvent.id));
    return { deadLetter: { id: Number((result as { insertId?: number }).insertId), providerEventId: input.providerEvent.id }, duplicate: false, emittedSuccess: false as const };
  } catch (error: any) {
    if (!errorHasDuplicateCode(error)) throw error;
    const [duplicate] = await db.select().from(providerDeadLetters).where(eq(providerDeadLetters.providerEventId, input.providerEvent.id)).limit(1);
    return { deadLetter: duplicate, duplicate: true, emittedSuccess: false as const };
  }
}
