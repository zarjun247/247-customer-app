import { describe, expect, it, beforeEach } from "vitest";
import fs from "fs";
import {
  completeJob,
  deadLetterJob,
  detectStaleRunningJobs,
  enqueueJob,
  failJob,
  getQueueStats,
  heartbeatJob,
  listDeadLetterJobs,
  markDeadLetterResolved,
  replayDeadLetterJob,
  reserveJob,
  resetJobQueueForTests,
  sanitizeJobPayload,
} from "./services/jobQueue";
import { executeJob, jobTypeRegistry } from "./services/workerRuntime";

describe("worker queue reliability layer", () => {
  beforeEach(() => resetJobQueueForTests());

  it("enqueue creates queued job", async () => {
    const result = await enqueueJob({
      queueName: "notifications",
      jobType: "notification.send.sms",
      idempotencyKey: "sms:1",
      payloadJson: { phone: "999" },
    });

    expect(result.duplicate).toBe(false);
    expect(result.job.status).toBe("queued");
    expect(result.job.payloadHash).toHaveLength(64);
  });

  it("reserve transitions correctly", async () => {
    await enqueueJob({
      queueName: "reports",
      jobType: "report.generate",
      idempotencyKey: "report:1",
    });

    const reserved = await reserveJob({
      queueName: "reports",
      workerId: "worker-a",
    });

    expect(reserved?.status).toBe("reserved");
    expect(reserved?.workerId).toBe("worker-a");
    expect(reserved?.heartbeatAt).toBeInstanceOf(Date);
  });

  it("complete transitions correctly", async () => {
    const enqueued = await enqueueJob({
      queueName: "reports",
      jobType: "report.generate",
      idempotencyKey: "report:2",
    });
    await reserveJob({ queueName: "reports", workerId: "worker-a" });

    const completed = await completeJob(enqueued.job.id, {
      workerId: "worker-a",
    });

    expect(completed.status).toBe("completed");
    expect(completed.completedAt).toBeInstanceOf(Date);
  });

  it("fail schedules retry when retryable", async () => {
    const enqueued = await enqueueJob({
      queueName: "providers",
      jobType: "provider.retry",
      idempotencyKey: "provider:1",
      maxRetries: 2,
    });
    await reserveJob({ queueName: "providers", workerId: "worker-a" });

    const failed = await failJob(enqueued.job.id, {
      reason: "transient provider timeout",
      retryable: true,
      workerId: "worker-a",
      retryDelayMs: 1_000,
    });

    expect(failed.status).toBe("retry_scheduled");
    expect(failed.retryCount).toBe(1);
    expect(failed.nextRetryAt).toBeInstanceOf(Date);
  });

  it("max retry exceeded becomes dead-letter", async () => {
    const enqueued = await enqueueJob({
      queueName: "providers",
      jobType: "provider.retry",
      idempotencyKey: "provider:2",
      maxRetries: 1,
    });
    await reserveJob({ queueName: "providers", workerId: "worker-a" });
    await failJob(enqueued.job.id, {
      reason: "first failure",
      retryable: true,
      workerId: "worker-a",
      retryDelayMs: 0,
    });
    await reserveJob({
      queueName: "providers",
      workerId: "worker-a",
      now: new Date(Date.now() + 10),
    });

    const dead = await failJob(enqueued.job.id, {
      reason: "second failure",
      retryable: true,
      workerId: "worker-a",
    });

    expect(dead.status).toBe("dead_letter");
    expect(dead.deadLetterClass).toBe("max_retries_exceeded");
  });

  it("duplicate idempotencyKey does not duplicate side effects", async () => {
    const first = await enqueueJob({
      queueName: "notifications",
      jobType: "notification.send.sms",
      idempotencyKey: "sms:dupe",
    });
    const second = await enqueueJob({
      queueName: "notifications",
      jobType: "notification.send.sms",
      idempotencyKey: "sms:dupe",
    });

    expect(second.duplicate).toBe(true);
    expect(second.job.id).toBe(first.job.id);
  });

  it("replay dead-letter preserves audit trail", async () => {
    const enqueued = await enqueueJob({
      queueName: "ocr",
      jobType: "ocr.parse.invoice",
      idempotencyKey: "ocr:1",
    });
    await deadLetterJob(enqueued.job.id, {
      reason: "poison payload",
      deadLetterClass: "poison_payload",
      actor: "worker-a",
    });

    const replay = await replayDeadLetterJob(enqueued.job.id, {
      actor: "ops-user",
      reason: "operator corrected payload",
      newIdempotencyKey: "ocr:1:replay",
    });
    const deadLetters = await listDeadLetterJobs();

    expect(replay.job.replayOfJobId).toBe(enqueued.job.id);
    expect(deadLetters[0].auditTrail.map(entry => entry.action)).toContain(
      "replay_requested"
    );
  });

  it("stale running jobs detected without auto-completing", async () => {
    await enqueueJob({
      queueName: "reports",
      jobType: "report.generate",
      idempotencyKey: "report:stale",
    });
    const old = new Date("2026-05-08T00:00:00.000Z");
    const reserved = await reserveJob({
      queueName: "reports",
      workerId: "worker-a",
      now: old,
    });

    const stale = await detectStaleRunningJobs({
      staleAfterMs: 60_000,
      now: new Date("2026-05-08T00:02:00.000Z"),
    });

    expect(stale).toHaveLength(1);
    expect(stale[0].id).toBe(reserved?.id);
    expect(stale[0].status).toBe("reserved");
  });

  it("heartbeat updates safely", async () => {
    const at = new Date("2026-05-08T00:00:00.000Z");
    const beat = new Date("2026-05-08T00:00:10.000Z");
    const enqueued = await enqueueJob({
      queueName: "reports",
      jobType: "report.generate",
      idempotencyKey: "report:heartbeat",
    });
    await reserveJob({ queueName: "reports", workerId: "worker-a", now: at });

    const updated = await heartbeatJob(enqueued.job.id, {
      workerId: "worker-a",
      at: beat,
    });

    expect(updated.heartbeatAt?.toISOString()).toBe(beat.toISOString());
    expect(updated.status).toBe("reserved");
  });

  it("payload redaction removes secrets/tokens/blobs", () => {
    const sanitized = sanitizeJobPayload({
      token: "abc",
      nested: { apiKey: "xyz", rawPrescriptionBlob: "imagebytes", ok: "value" },
    });

    expect(sanitized).toEqual({
      token: "[REDACTED]",
      nested: {
        apiKey: "[REDACTED]",
        rawPrescriptionBlob: "[REDACTED]",
        ok: "value",
      },
    });
  });

  it("provider_unconfigured/demo_skipped not treated success", async () => {
    await enqueueJob({
      queueName: "providers",
      jobType: "provider.retry",
      idempotencyKey: "provider:unsafe",
    });
    const reserved = await reserveJob({
      queueName: "providers",
      workerId: "worker-a",
    });

    const result = await executeJob(reserved!, {
      workerId: "worker-a",
      handler: () => ({ ok: true, status: "provider_unconfigured" }),
    });

    expect(result.status).toBe("dead_letter");
    expect(result.job.deadLetterClass).toBe("provider_unavailable");
  });

  it("queue health summary works", async () => {
    await enqueueJob({
      queueName: "q",
      jobType: "report.generate",
      idempotencyKey: "health:queued",
    });
    await enqueueJob({
      queueName: "q",
      jobType: "report.generate",
      idempotencyKey: "health:retry",
      scheduledAt: new Date(Date.now() + 60_000),
    });
    const dead = await enqueueJob({
      queueName: "q",
      jobType: "report.generate",
      idempotencyKey: "health:dead",
    });
    await deadLetterJob(dead.job.id, {
      reason: "operator test",
      actor: "test",
    });

    const stats = await getQueueStats({ queueName: "q" });

    expect(stats.queuedCount).toBe(1);
    expect(stats.retryCount).toBe(1);
    expect(stats.deadLetterCount).toBe(1);
  });

  it("worker replay does not bypass idempotency", async () => {
    const enqueued = await enqueueJob({
      queueName: "notifications",
      jobType: "notification.send.sms",
      idempotencyKey: "sms:completed",
    });
    await reserveJob({ queueName: "notifications", workerId: "worker-a" });
    await executeJob(
      { ...enqueued.job, status: "reserved" },
      { workerId: "worker-a", handler: () => ({ ok: true, status: "sent" }) }
    );

    const replay = await enqueueJob({
      queueName: "notifications",
      jobType: "notification.send.sms",
      idempotencyKey: "sms:completed",
      replayOfJobId: enqueued.job.id,
    });

    expect(replay.duplicate).toBe(true);
    expect(replay.alreadyCompleted).toBe(true);
  });

  it("operator can mark dead-letter resolved", async () => {
    const enqueued = await enqueueJob({
      queueName: "q",
      jobType: "queue.reconciliation",
      idempotencyKey: "resolve:1",
    });
    await deadLetterJob(enqueued.job.id, {
      reason: "manual review",
      actor: "worker-a",
    });

    const resolved = await markDeadLetterResolved(enqueued.job.id, {
      actor: "ops-user",
      note: "documented externally",
    });

    expect(resolved.resolvedBy).toBe("ops-user");
    expect(resolved.auditTrail.map(entry => entry.action)).toContain(
      "dead_letter_resolved"
    );
  });

  it("no stock/payment/compliance mutation bypass introduced", () => {
    expect(
      Object.values(jobTypeRegistry).every(
        entry => entry.regulatedExecutionAllowed === false
      )
    ).toBe(true);
    const queueSource = fs.readFileSync("server/services/jobQueue.ts", "utf8");
    const runtimeSource = fs.readFileSync(
      "server/services/workerRuntime.ts",
      "utf8"
    );

    expect(`${queueSource}\n${runtimeSource}`).not.toMatch(
      /update\((stockMovements|paymentRecords|h1Register|prescriptions)\)/
    );
    expect(`${queueSource}\n${runtimeSource}`).toContain(
      "idempotencyKey is required"
    );
  });
});
