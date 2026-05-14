import crypto from "crypto";

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

const SECRET_KEY_PATTERN =
  /(secret|token|password|authorization|api[_-]?key|cookie|session|credential|private[_-]?key|signature|webhook)/i;
const BLOB_KEY_PATTERN =
  /(raw.*prescription|prescription.*blob|blob|base64|imageData|fileData|documentData|ocrRawText|rawPayload|rawBody)/i;
const PHI_KEY_PATTERN =
  /(patient|customerName|name|phone|mobile|email|address|flat|doctor|prescription|rx|diagnosis|symptom|medical|notes?)/i;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_PATTERN = /\b(?:\+?\d[\s-]?){10,14}\b/g;
const MAX_STRING_LENGTH = 1_000;

export function sanitizeJobPayload(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[REDACTED:depth_limit]";
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value))
    return value.map(item => sanitizeJobPayload(item, depth + 1));
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(
      value as Record<string, unknown>
    )) {
      if (SECRET_KEY_PATTERN.test(key) || BLOB_KEY_PATTERN.test(key)) {
        result[key] = "[REDACTED]";
      } else if (PHI_KEY_PATTERN.test(key)) {
        result[key] = "[REDACTED:phi]";
      } else {
        result[key] = sanitizeJobPayload(nested, depth + 1);
      }
    }
    return result;
  }
  if (typeof value === "string") {
    if (value.length > MAX_STRING_LENGTH)
      return `[REDACTED:length:${value.length}]`;
    if (/^Bearer\s+/i.test(value)) return "[REDACTED]";
    return value
      .replace(EMAIL_PATTERN, "[EMAIL]")
      .replace(PHONE_PATTERN, "[PHONE]");
  }
  return value;
}

export function hashJobPayload(payload: unknown): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
}
