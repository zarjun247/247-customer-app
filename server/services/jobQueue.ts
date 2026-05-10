import crypto from "crypto";
import { recordProviderEvent } from "./providerEventsService";

export type WorkerJobStatus =
  | "queued"
  | "reserved"
  | "running"
  | "completed"
  | "failed"
  | "retry_scheduled"
  | "dead_letter"
  | "cancelled"
  | "expired";

export type DeadLetterClass =
  | "max_retries_exceeded"
  | "poison_payload"
  | "non_retryable"
  | "provider_unavailable"
  | "operator_cancelled"
  | "stale_orphaned"
  | "unknown";

export type WorkerJobPayload = Record<string, unknown>;

export type WorkerJob = {
  id: number;
  queueName: string;
  jobType: string;
  payloadJson: WorkerJobPayload;
  payloadHash: string;
  idempotencyKey: string;
  correlationId: string | null;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  status: WorkerJobStatus;
  priority: number;
  retryCount: number;
  maxRetries: number;
  nextRetryAt: Date | null;
  workerId: string | null;
  reservedAt: Date | null;
  completedAt: Date | null;
  failureReason: string | null;
  deadLetterReason: string | null;
  deadLetterClass: DeadLetterClass | null;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  resolutionNote: string | null;
  heartbeatAt: Date | null;
  replayOfJobId: number | null;
  auditTrail: WorkerJobAuditEntry[];
  createdAt: Date;
  updatedAt: Date;
};

export type WorkerJobAuditEntry = {
  at: string;
  action: string;
  actor?: string;
  reason?: string;
  fromStatus?: WorkerJobStatus;
  toStatus?: WorkerJobStatus;
  details?: Record<string, unknown>;
};

export type EnqueueJobInput = {
  queueName: string;
  jobType: string;
  payloadJson?: WorkerJobPayload;
  idempotencyKey: string;
  correlationId?: string | null;
  relatedEntityType?: string | null;
  relatedEntityId?: string | number | null;
  priority?: number;
  maxRetries?: number;
  scheduledAt?: Date | null;
  replayOfJobId?: number | null;
};

export type EnqueueJobResult = {
  job: WorkerJob;
  duplicate: boolean;
  alreadyCompleted: boolean;
};

export type QueueStats = {
  queuedCount: number;
  runningCount: number;
  retryCount: number;
  deadLetterCount: number;
  staleRunningCount: number;
  oldestQueuedAgeMs: number | null;
  oldestRetryAgeMs: number | null;
  generatedAt: string;
};

export type StaleJob = WorkerJob & { staleForMs: number };

const SECRET_KEY_PATTERN = /(secret|token|password|authorization|api[_-]?key|cookie|session|credential|private[_-]?key)/i;
const BLOB_KEY_PATTERN = /(raw.*prescription|prescription.*blob|blob|base64|imageData|fileData|documentData|ocrRawText)/i;
const MAX_STRING_LENGTH = 1_000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_QUEUE = "default";

let nextMemoryId = 1;
const memoryJobs = new Map<number, WorkerJob>();

function now() {
  return new Date();
}

function audit(action: string, fromStatus: WorkerJobStatus | undefined, toStatus: WorkerJobStatus | undefined, reason?: string, actor?: string, details?: Record<string, unknown>): WorkerJobAuditEntry {
  return { at: now().toISOString(), action, actor, reason, fromStatus, toStatus, details };
}

function touch(job: WorkerJob) {
  job.updatedAt = now();
}

export function sanitizeJobPayload(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[REDACTED:depth_limit]";
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => sanitizeJobPayload(item, depth + 1));
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY_PATTERN.test(key) || BLOB_KEY_PATTERN.test(key)) {
        result[key] = "[REDACTED]";
      } else {
        result[key] = sanitizeJobPayload(nested, depth + 1);
      }
    }
    return result;
  }
  if (typeof value === "string") {
    if (value.length > MAX_STRING_LENGTH) return `[REDACTED:length:${value.length}]`;
    if (/^Bearer\s+/i.test(value)) return "[REDACTED]";
  }
  return value;
}

export function hashJobPayload(payload: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function getMemoryJobsForTests(): WorkerJob[] {
  return Array.from(memoryJobs.values()).map(cloneJob);
}

export function resetJobQueueForTests(): void {
  memoryJobs.clear();
  nextMemoryId = 1;
}

function cloneJob(job: WorkerJob): WorkerJob {
  return {
    ...job,
    payloadJson: JSON.parse(JSON.stringify(job.payloadJson)),
    auditTrail: job.auditTrail.map((entry) => ({ ...entry, details: entry.details ? { ...entry.details } : undefined })),
  };
}

function findDuplicate(idempotencyKey: string, replayOfJobId?: number | null): WorkerJob | undefined {
  return Array.from(memoryJobs.values()).find((job) => {
    if (job.idempotencyKey !== idempotencyKey) return false;
    if (replayOfJobId && job.id === replayOfJobId && job.status === "dead_letter") return false;
    return !["cancelled", "expired"].includes(job.status);
  });
}

export async function enqueueJob(input: EnqueueJobInput): Promise<EnqueueJobResult> {
  if (!input.idempotencyKey || input.idempotencyKey.trim().length === 0) {
    throw new Error("idempotencyKey is required for worker jobs");
  }

  const duplicate = findDuplicate(input.idempotencyKey, input.replayOfJobId);
  if (duplicate) {
    return { job: cloneJob(duplicate), duplicate: true, alreadyCompleted: duplicate.status === "completed" };
  }

  const sanitized = sanitizeJobPayload(input.payloadJson ?? {}) as WorkerJobPayload;
  const createdAt = now();
  const scheduled = input.scheduledAt && input.scheduledAt.getTime() > createdAt.getTime();
  const job: WorkerJob = {
    id: nextMemoryId++,
    queueName: input.queueName || DEFAULT_QUEUE,
    jobType: input.jobType,
    payloadJson: sanitized,
    payloadHash: hashJobPayload(sanitized),
    idempotencyKey: input.idempotencyKey,
    correlationId: input.correlationId ?? null,
    relatedEntityType: input.relatedEntityType ?? null,
    relatedEntityId: input.relatedEntityId == null ? null : String(input.relatedEntityId),
    status: scheduled ? "retry_scheduled" : "queued",
    priority: input.priority ?? 0,
    retryCount: 0,
    maxRetries: input.maxRetries ?? DEFAULT_MAX_RETRIES,
    nextRetryAt: scheduled ? input.scheduledAt ?? null : null,
    workerId: null,
    reservedAt: null,
    completedAt: null,
    failureReason: null,
    deadLetterReason: null,
    deadLetterClass: null,
    resolvedAt: null,
    resolvedBy: null,
    resolutionNote: null,
    heartbeatAt: null,
    replayOfJobId: input.replayOfJobId ?? null,
    auditTrail: [audit("enqueue", undefined, scheduled ? "retry_scheduled" : "queued", undefined, "system", { payloadHash: hashJobPayload(sanitized), replayOfJobId: input.replayOfJobId ?? null })],
    createdAt,
    updatedAt: createdAt,
  };
  memoryJobs.set(job.id, job);
  return { job: cloneJob(job), duplicate: false, alreadyCompleted: false };
}

export async function reserveJob(input: { queueName?: string; workerId: string; now?: Date }): Promise<WorkerJob | null> {
  const current = input.now ?? now();
  const candidates = Array.from(memoryJobs.values())
    .filter((job) => {
      if (input.queueName && job.queueName !== input.queueName) return false;
      if (job.status === "queued") return true;
      return job.status === "retry_scheduled" && (!job.nextRetryAt || job.nextRetryAt.getTime() <= current.getTime());
    })
    .sort((a, b) => b.priority - a.priority || a.createdAt.getTime() - b.createdAt.getTime());

  const job = candidates[0];
  if (!job) return null;
  const from = job.status;
  job.status = "reserved";
  job.workerId = input.workerId;
  job.reservedAt = current;
  job.heartbeatAt = current;
  job.auditTrail.push(audit("reserve", from, "reserved", undefined, input.workerId));
  touch(job);
  return cloneJob(job);
}

export async function completeJob(jobId: number, input: { workerId?: string; result?: Record<string, unknown> } = {}): Promise<WorkerJob> {
  const job = requireJob(jobId);
  if (job.status === "completed") return cloneJob(job);
  if (!["reserved", "running"].includes(job.status)) throw new Error(`Cannot complete job ${jobId} from status ${job.status}`);
  const from = job.status;
  job.status = "completed";
  job.completedAt = now();
  job.failureReason = null;
  job.nextRetryAt = null;
  job.auditTrail.push(audit("complete", from, "completed", undefined, input.workerId ?? job.workerId ?? "worker", { result: sanitizeJobPayload(input.result ?? {}) as Record<string, unknown> }));
  touch(job);
  return cloneJob(job);
}

export async function failJob(jobId: number, input: { reason: string; retryable?: boolean; workerId?: string; retryDelayMs?: number; deadLetterClass?: DeadLetterClass }): Promise<WorkerJob> {
  const job = requireJob(jobId);
  if (["completed", "dead_letter", "cancelled"].includes(job.status)) return cloneJob(job);
  const retryable = input.retryable ?? true;
  if (!retryable) return deadLetterJob(jobId, { reason: input.reason, deadLetterClass: input.deadLetterClass ?? "non_retryable", actor: input.workerId ?? job.workerId ?? "worker" });
  if (job.retryCount + 1 > job.maxRetries) {
    return deadLetterJob(jobId, { reason: input.reason, deadLetterClass: input.deadLetterClass ?? "max_retries_exceeded", actor: input.workerId ?? job.workerId ?? "worker" });
  }
  return retryJob(jobId, { reason: input.reason, workerId: input.workerId, delayMs: input.retryDelayMs });
}

export async function retryJob(jobId: number, input: { reason: string; workerId?: string; delayMs?: number } = { reason: "retry requested" }): Promise<WorkerJob> {
  const job = requireJob(jobId);
  if (["completed", "dead_letter", "cancelled"].includes(job.status)) return cloneJob(job);
  const from = job.status;
  job.retryCount += 1;
  job.status = "retry_scheduled";
  job.failureReason = input.reason;
  job.workerId = null;
  job.nextRetryAt = new Date(Date.now() + (input.delayMs ?? Math.min(60_000, 1_000 * 2 ** Math.max(0, job.retryCount - 1))));
  job.auditTrail.push(audit("retry", from, "retry_scheduled", input.reason, input.workerId ?? "worker", { retryCount: job.retryCount, nextRetryAt: job.nextRetryAt.toISOString() }));
  touch(job);
  return cloneJob(job);
}

export async function deadLetterJob(jobId: number, input: { reason: string; deadLetterClass?: DeadLetterClass; actor?: string }): Promise<WorkerJob> {
  const job = requireJob(jobId);
  if (job.status === "completed") return cloneJob(job);
  const from = job.status;
  job.status = "dead_letter";
  job.deadLetterReason = input.reason;
  job.deadLetterClass = input.deadLetterClass ?? classifyDeadLetter(input.reason, job);
  job.failureReason = input.reason;
  job.workerId = null;
  job.nextRetryAt = null;
  job.auditTrail.push(audit("dead_letter", from, "dead_letter", input.reason, input.actor ?? "worker", { deadLetterClass: job.deadLetterClass }));
  touch(job);

  // If this dead-letter is provider-related, record a durable provider event for ops review.
  if (job.deadLetterClass === "provider_unavailable") {
    const provider = (job.payloadJson && (job.payloadJson as any).provider) ?? job.relatedEntityType ?? "unknown";
    void recordProviderEvent({
      provider: String(provider ?? "unknown"),
      operation: "job_dead_letter",
      status: "dead_letter",
      errorMessage: input.reason,
      payload: { jobId: job.id, jobType: job.jobType, relatedEntityType: job.relatedEntityType, relatedEntityId: job.relatedEntityId },
    }).catch(() => {});
  }

  return cloneJob(job);
}

export async function cancelJob(jobId: number, input: { reason: string; actor: string }): Promise<WorkerJob> {
  const job = requireJob(jobId);
  if (["completed", "dead_letter"].includes(job.status)) return cloneJob(job);
  const from = job.status;
  job.status = "cancelled";
  job.failureReason = input.reason;
  job.auditTrail.push(audit("cancel", from, "cancelled", input.reason, input.actor));
  touch(job);
  return cloneJob(job);
}

export async function heartbeatJob(jobId: number, input: { workerId: string; at?: Date }): Promise<WorkerJob> {
  const job = requireJob(jobId);
  if (!["reserved", "running"].includes(job.status)) throw new Error(`Cannot heartbeat job ${jobId} from status ${job.status}`);
  job.heartbeatAt = input.at ?? now();
  job.workerId = input.workerId;
  job.auditTrail.push(audit("heartbeat", job.status, job.status, undefined, input.workerId));
  touch(job);
  return cloneJob(job);
}

export async function markJobRunning(jobId: number, workerId: string): Promise<WorkerJob> {
  const job = requireJob(jobId);
  if (job.status === "completed") return cloneJob(job);
  if (job.status !== "reserved") throw new Error(`Cannot run job ${jobId} from status ${job.status}`);
  job.status = "running";
  job.workerId = workerId;
  job.heartbeatAt = now();
  job.auditTrail.push(audit("start", "reserved", "running", undefined, workerId));
  touch(job);
  return cloneJob(job);
}

export async function listDeadLetterJobs(input: { queueName?: string; unresolvedOnly?: boolean } = {}): Promise<WorkerJob[]> {
  return Array.from(memoryJobs.values())
    .filter((job) => job.status === "dead_letter")
    .filter((job) => !input.queueName || job.queueName === input.queueName)
    .filter((job) => !input.unresolvedOnly || !job.resolvedAt)
    .map(cloneJob);
}

export async function replayDeadLetterJob(jobId: number, input: { actor: string; reason: string; newIdempotencyKey?: string }): Promise<EnqueueJobResult> {
  const job = requireJob(jobId);
  if (job.status !== "dead_letter") throw new Error(`Job ${jobId} is not dead-lettered`);
  job.auditTrail.push(audit("replay_requested", "dead_letter", "dead_letter", input.reason, input.actor));
  touch(job);
  return enqueueJob({
    queueName: job.queueName,
    jobType: job.jobType,
    payloadJson: job.payloadJson,
    idempotencyKey: input.newIdempotencyKey ?? job.idempotencyKey,
    correlationId: job.correlationId,
    relatedEntityType: job.relatedEntityType,
    relatedEntityId: job.relatedEntityId,
    priority: job.priority,
    maxRetries: job.maxRetries,
    replayOfJobId: job.id,
  });
}

export async function markDeadLetterResolved(jobId: number, input: { actor: string; note: string }): Promise<WorkerJob> {
  const job = requireJob(jobId);
  if (job.status !== "dead_letter") throw new Error(`Job ${jobId} is not dead-lettered`);
  job.resolvedAt = now();
  job.resolvedBy = input.actor;
  job.resolutionNote = input.note;
  job.auditTrail.push(audit("dead_letter_resolved", "dead_letter", "dead_letter", input.note, input.actor));
  touch(job);
  return cloneJob(job);
}

export async function detectStaleRunningJobs(input: { staleAfterMs: number; now?: Date; queueName?: string }): Promise<StaleJob[]> {
  const current = input.now ?? now();
  return Array.from(memoryJobs.values())
    .filter((job) => ["reserved", "running"].includes(job.status))
    .filter((job) => !input.queueName || job.queueName === input.queueName)
    .map((job) => ({ job, age: current.getTime() - (job.heartbeatAt ?? job.reservedAt ?? job.updatedAt).getTime() }))
    .filter(({ age }) => age > input.staleAfterMs)
    .map(({ job, age }) => ({ ...cloneJob(job), staleForMs: age }));
}

export async function classifyOrphanedJob(jobId: number, input: { actor: string; reason: string }): Promise<WorkerJob> {
  return deadLetterJob(jobId, { reason: input.reason, deadLetterClass: "stale_orphaned", actor: input.actor });
}

export async function getQueueStats(input: { queueName?: string; staleAfterMs?: number; now?: Date } = {}): Promise<QueueStats> {
  const current = input.now ?? now();
  const jobs = Array.from(memoryJobs.values()).filter((job) => !input.queueName || job.queueName === input.queueName);
  const oldestQueued = jobs.filter((job) => job.status === "queued").sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
  const oldestRetry = jobs.filter((job) => job.status === "retry_scheduled").sort((a, b) => (a.nextRetryAt ?? a.updatedAt).getTime() - (b.nextRetryAt ?? b.updatedAt).getTime())[0];
  const staleRunning = await detectStaleRunningJobs({ staleAfterMs: input.staleAfterMs ?? 5 * 60_000, now: current, queueName: input.queueName });
  return {
    queuedCount: jobs.filter((job) => job.status === "queued").length,
    runningCount: jobs.filter((job) => ["reserved", "running"].includes(job.status)).length,
    retryCount: jobs.filter((job) => job.status === "retry_scheduled").length,
    deadLetterCount: jobs.filter((job) => job.status === "dead_letter").length,
    staleRunningCount: staleRunning.length,
    oldestQueuedAgeMs: oldestQueued ? current.getTime() - oldestQueued.createdAt.getTime() : null,
    oldestRetryAgeMs: oldestRetry ? current.getTime() - (oldestRetry.nextRetryAt ?? oldestRetry.updatedAt).getTime() : null,
    generatedAt: current.toISOString(),
  };
}

export function isUnsafeProviderSuccess(result: unknown): boolean {
  if (!result || typeof result !== "object") return false;
  const status = String((result as { status?: unknown }).status ?? "");
  return ["provider_unconfigured", "skipped_demo", "demo_skipped"].includes(status);
}

function classifyDeadLetter(reason: string, job: WorkerJob): DeadLetterClass {
  const value = reason.toLowerCase();
  if (value.includes("poison") || value.includes("invalid payload")) return "poison_payload";
  if (value.includes("provider_unconfigured") || value.includes("skipped_demo") || value.includes("demo_skipped")) return "provider_unavailable";
  if (job.retryCount >= job.maxRetries) return "max_retries_exceeded";
  return "unknown";
}

function requireJob(jobId: number): WorkerJob {
  const job = memoryJobs.get(jobId);
  if (!job) throw new Error(`Worker job ${jobId} not found`);
  return job;
}
