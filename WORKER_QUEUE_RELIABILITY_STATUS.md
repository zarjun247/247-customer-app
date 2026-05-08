# Worker Queue Reliability Status

## Scope

This document describes the Wave 1 queue/worker reliability foundation. It is infrastructure only: it gives future notification, OCR, provider retry, report, AI, reconciliation, and reminder work a replay-safe lifecycle, but it does not approve autonomous regulated fulfillment.

> **Explicit safety warning:** this reliability layer must not be used to autonomously dispense regulated medicines, bypass payment verification, mutate stock outside approved inventory services, approve prescriptions, or skip H1/compliance controls.

## Job Lifecycle States

`worker_jobs` supports these states:

- `queued` — accepted for future execution with a sanitized payload and required idempotency key.
- `reserved` — claimed by a worker with `workerId`, `reservedAt`, and `heartbeatAt` set.
- `running` — execution has started after reservation.
- `completed` — finished successfully once; repeated idempotent calls return an already-completed response.
- `failed` — reserved for explicit failure visibility; retryable failures normally move to `retry_scheduled`.
- `retry_scheduled` — retry is delayed until `nextRetryAt`; every retry increments `retryCount`.
- `dead_letter` — capped, poison, non-retryable, provider-unavailable, or orphaned jobs requiring operator review.
- `cancelled` — explicitly cancelled before completion.
- `expired` — available for future retention/expiry policies.

## Retry and Dead-Letter Rules

- Each job has `maxRetries`; the registry supplies conservative defaults by operation type.
- `failJob` schedules a retry only when the operation is retryable and the retry cap has not been exceeded.
- `retryJob` increments `retryCount` and records an audit entry.
- Jobs exceeding the cap move to `dead_letter` with `deadLetterClass = max_retries_exceeded`.
- Poison payloads, non-retryable operations, unsafe provider states, and stale/orphan classification move to `dead_letter` explicitly.
- `provider_unconfigured`, `skipped_demo`, and `demo_skipped` are never treated as successful provider sends/syncs.

## Idempotency Behavior

- `enqueueJob` requires an `idempotencyKey`.
- Duplicate active idempotency keys return the existing job instead of creating a second side-effect opportunity.
- If the existing job is completed, callers receive an already-completed response.
- Dead-letter replay preserves the original idempotency key unless an operator explicitly supplies a new key, and replay never bypasses the duplicate-completion check.
- Payloads are hashed after sanitization so operators can correlate work without exposing sensitive content.

## Payload Redaction

Worker payloads are sanitized before storage. Secret-like keys (`token`, `secret`, `password`, `apiKey`, `authorization`, cookies, sessions, credentials) and blob-like keys (`rawPrescriptionBlob`, `base64`, `imageData`, `fileData`, OCR raw text) are replaced with `[REDACTED]`. Very large strings are replaced with a length marker. Do not enqueue secrets, tokens, raw prescription images, or unredacted provider payloads.

## Stale Job Handling

- Workers update `heartbeatAt` using `heartbeatJob` while reserved/running.
- `detectStaleRunningJobs` reports jobs with old heartbeats.
- Stale jobs are not auto-completed.
- Orphan recovery must be explicit and auditable; operators may classify an orphan via dead-letter handling and replay only after review.

## Provider and Offline Integration

- Provider retry operations are represented by `provider.retry` in the registry.
- Provider unavailable/demo statuses are dead-letter-visible and not marked success.
- Offline/recovery code can safely enqueue replay jobs using a deterministic idempotency key; duplicate replay jobs are blocked by `enqueueJob`.
- This layer does not mutate payment/refund/stock/compliance truth. Approved domain services remain the only place for those mutations.

## Queue Health Visibility

`/api/health` exposes a payload-free queue summary:

- queued count
- running/reserved count
- retry count
- dead-letter count
- stale-running count
- oldest queued age
- oldest retry age

Payloads, secrets, and raw job bodies are not exposed by health output.

## Operational Replay Workflow

1. Review `listDeadLetterJobs` output and inspect the sanitized payload hash, type, correlation ID, and audit trail.
2. Correct upstream data/configuration outside the worker if needed.
3. Call `replayDeadLetterJob` with an explicit operator actor and reason.
4. Keep the original idempotency key unless a reviewed, documented reason requires a new key.
5. Execute replay through the normal reservation/runtime path.
6. Mark the old dead-letter resolved with `markDeadLetterResolved` only after operational review is complete.

## Current Job Type Registry

The registry defines safe metadata for:

- `notification.send.sms`
- `notification.send.whatsapp`
- `notification.send.email`
- `provider.retry`
- `ocr.parse.prescription`
- `ocr.parse.invoice`
- `report.generate`
- `refill.reminder`
- `ai.anomaly.scan`
- `ai.expiry.analysis`
- `queue.reconciliation`

Every registry entry currently sets `regulatedExecutionAllowed: false`.

## Remaining Limitations

- The current service implementation is intentionally conservative and test-friendly; production deployment still needs an approved persistent runner/cron strategy and operational dashboards.
- DB-backed concurrency tests should be enabled when `TEST_DATABASE_URL` is available in CI.
- Handlers must be explicitly registered and reviewed before production use.
- This is not a claim of production readiness for autonomous workflows.
