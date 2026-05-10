import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { deadLetterProviderEventInMemory, scheduleProviderRetryInMemory, type ProviderRetryProofState } from "./services/providerEventsService";

describe("provider dead-letter retry proof", () => {
  it("schedules provider retry by incrementing attempt count without emitting fake success", () => {
    const state: ProviderRetryProofState = { providerEventId: 7, processingStatus: "verified", attemptCount: 0, maxAttempts: 3, failureReason: null };
    const retry = scheduleProviderRetryInMemory(state, { reason: "refund ledger temporarily unavailable" });
    expect(retry.processingStatus).toBe("retry_scheduled");
    expect(retry.attemptCount).toBe(1);
    expect(retry.failureReason).toBe("refund ledger temporarily unavailable");
    expect(retry.emittedSuccess).toBe(false);
  });

  it("moves exhausted provider event to exactly one dead letter and preserves operator review fields", () => {
    const state: ProviderRetryProofState = { providerEventId: 8, processingStatus: "retry_scheduled", attemptCount: 3, maxAttempts: 3, failureReason: "provider timeout" };
    const first = deadLetterProviderEventInMemory(state, { reason: "max retries exceeded", deadLetterClass: "max_retries_exceeded" });
    const reviewed = { ...first, deadLetter: { ...first.deadLetter!, reviewedBy: "ops-1", reviewedAt: new Date("2026-05-10T00:00:00.000Z"), reviewNote: "review in progress" } };
    const second = deadLetterProviderEventInMemory(reviewed, { reason: "second worker race", deadLetterClass: "max_retries_exceeded" });

    expect(first.processingStatus).toBe("dead_letter");
    expect(first.duplicateDeadLetter).toBe(false);
    expect(second.duplicateDeadLetter).toBe(true);
    expect(second.deadLetter?.reviewedBy).toBe("ops-1");
    expect(second.deadLetter?.reviewNote).toBe("review in progress");
    expect(second.emittedSuccess).toBe(false);
  });

  it("schema and migration enforce one dead letter per provider event", () => {
    const schema = fs.readFileSync("drizzle/schema.ts", "utf8");
    const migration = fs.readFileSync("drizzle/0049_provider_retry_dead_letters.sql", "utf8");
    const lifecycle = fs.readFileSync("server/services/paymentWebhookLifecycle.ts", "utf8");

    expect(schema).toContain("providerDeadLetters");
    expect(schema).toContain("uqProviderDeadLettersEvent");
    expect(schema).toContain("retry_scheduled");
    expect(schema).toContain("attemptCount");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS `provider_dead_letters`");
    expect(migration).toContain("UNIQUE(`providerEventId`)");
    expect(lifecycle).toContain("scheduleProviderEventRetry");
    expect(lifecycle).not.toContain('status: "processed" as any');
  });
});
