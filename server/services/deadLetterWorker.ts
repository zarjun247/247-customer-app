/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any */
import { eq } from "drizzle-orm";
import { providerWebhookEvents } from "../../drizzle/schema";
import {
  moveProviderEventToDeadLetterOnce,
  scheduleProviderEventRetry,
} from "./providerEventsService";

export async function recordProviderFailureForRetry(
  db: any,
  input: {
    providerEventRowId: number;
    reason: string;
    retryDelayMs?: number;
    maxAttempts?: number;
  }
) {
  return scheduleProviderEventRetry(db, input);
}

export async function exhaustProviderEventToDeadLetter(
  db: any,
  input: {
    providerEventRowId: number;
    reason: string;
    deadLetterClass?: string;
  }
) {
  const [event] = await db
    .select()
    .from(providerWebhookEvents)
    .where(eq(providerWebhookEvents.id, input.providerEventRowId))
    .limit(1);
  if (!event) throw new Error("provider event not found");
  return moveProviderEventToDeadLetterOnce(db, {
    providerEvent: event,
    reason: input.reason,
    deadLetterClass: input.deadLetterClass ?? "max_retries_exceeded",
  });
}
