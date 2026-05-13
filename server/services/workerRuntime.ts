import {
  completeJob,
  deadLetterJob,
  failJob,
  heartbeatJob,
  isUnsafeProviderSuccess,
  markJobRunning,
  reserveJob,
  type DeadLetterClass,
  type WorkerJob,
} from "./jobQueue";
import {
  assertAITaskAllowed,
  auditAIDecision,
  classifyAITask,
} from "./aiGovernance";

export type WorkerOperationMetadata = {
  jobType: string;
  retryable: boolean;
  maxRetries: number;
  timeoutMs?: number;
  deadLetterConditions: string[];
  mutatesExternalState: boolean;
  requiresProviderHealthy: boolean;
  safeInDegradedMode: boolean;
  regulatedExecutionAllowed: false;
  aiTaskClassification?: ReturnType<typeof classifyAITask>;
  governanceBoundary?: "assistive_only_no_regulated_mutation";
};

export type WorkerHandlerResult = Record<string, unknown> | void;
export type WorkerHandler = (
  job: WorkerJob
) => Promise<WorkerHandlerResult> | WorkerHandlerResult;

export const jobTypeRegistry: Record<string, WorkerOperationMetadata> = {
  "notification.send.sms": {
    jobType: "notification.send.sms",
    retryable: true,
    maxRetries: 3,
    timeoutMs: 15_000,
    deadLetterConditions: [
      "provider_unconfigured",
      "skipped_demo",
      "max_retries_exceeded",
      "invalid_recipient",
    ],
    mutatesExternalState: true,
    requiresProviderHealthy: true,
    safeInDegradedMode: false,
    regulatedExecutionAllowed: false,
  },
  "notification.send.whatsapp": {
    jobType: "notification.send.whatsapp",
    retryable: true,
    maxRetries: 3,
    timeoutMs: 15_000,
    deadLetterConditions: [
      "provider_unconfigured",
      "skipped_demo",
      "max_retries_exceeded",
      "template_rejected",
    ],
    mutatesExternalState: true,
    requiresProviderHealthy: true,
    safeInDegradedMode: false,
    regulatedExecutionAllowed: false,
  },
  "notification.send.email": {
    jobType: "notification.send.email",
    retryable: true,
    maxRetries: 3,
    timeoutMs: 20_000,
    deadLetterConditions: [
      "provider_unconfigured",
      "skipped_demo",
      "max_retries_exceeded",
      "hard_bounce",
    ],
    mutatesExternalState: true,
    requiresProviderHealthy: true,
    safeInDegradedMode: false,
    regulatedExecutionAllowed: false,
  },
  "provider.retry": {
    jobType: "provider.retry",
    retryable: true,
    maxRetries: 5,
    timeoutMs: 30_000,
    deadLetterConditions: [
      "provider_unconfigured",
      "skipped_demo",
      "max_retries_exceeded",
      "non_idempotent_provider_call",
    ],
    mutatesExternalState: true,
    requiresProviderHealthy: true,
    safeInDegradedMode: false,
    regulatedExecutionAllowed: false,
  },
  "ocr.parse.prescription": {
    jobType: "ocr.parse.prescription",
    retryable: true,
    maxRetries: 2,
    timeoutMs: 60_000,
    deadLetterConditions: [
      "poison_payload",
      "max_retries_exceeded",
      "unsafe_raw_prescription_blob",
    ],
    mutatesExternalState: false,
    requiresProviderHealthy: true,
    safeInDegradedMode: false,
    regulatedExecutionAllowed: false,
    aiTaskClassification: "ocr_data_capture",
    governanceBoundary: "assistive_only_no_regulated_mutation",
  },
  "ocr.parse.invoice": {
    jobType: "ocr.parse.invoice",
    aiTaskClassification: "ocr_data_capture",
    governanceBoundary: "assistive_only_no_regulated_mutation",
    retryable: true,
    maxRetries: 2,
    timeoutMs: 60_000,
    deadLetterConditions: ["poison_payload", "max_retries_exceeded"],
    mutatesExternalState: false,
    requiresProviderHealthy: true,
    safeInDegradedMode: false,
    regulatedExecutionAllowed: false,
  },
  "report.generate": {
    jobType: "report.generate",
    retryable: true,
    maxRetries: 2,
    timeoutMs: 120_000,
    deadLetterConditions: ["max_retries_exceeded", "invalid_report_scope"],
    mutatesExternalState: false,
    requiresProviderHealthy: false,
    safeInDegradedMode: true,
    regulatedExecutionAllowed: false,
  },
  "refill.reminder": {
    jobType: "refill.reminder",
    retryable: true,
    maxRetries: 3,
    timeoutMs: 15_000,
    deadLetterConditions: [
      "provider_unconfigured",
      "skipped_demo",
      "consent_missing",
      "max_retries_exceeded",
    ],
    mutatesExternalState: true,
    requiresProviderHealthy: true,
    safeInDegradedMode: false,
    regulatedExecutionAllowed: false,
  },
  "ai.anomaly.scan": {
    jobType: "ai.anomaly.scan",
    aiTaskClassification: "operational_anomaly_detection",
    governanceBoundary: "assistive_only_no_regulated_mutation",
    retryable: true,
    maxRetries: 2,
    timeoutMs: 90_000,
    deadLetterConditions: [
      "provider_unconfigured",
      "skipped_demo",
      "max_retries_exceeded",
    ],
    mutatesExternalState: false,
    requiresProviderHealthy: true,
    safeInDegradedMode: false,
    regulatedExecutionAllowed: false,
  },
  "ai.expiry.analysis": {
    jobType: "ai.expiry.analysis",
    aiTaskClassification: "inventory_expiry_analysis",
    governanceBoundary: "assistive_only_no_regulated_mutation",
    retryable: true,
    maxRetries: 2,
    timeoutMs: 90_000,
    deadLetterConditions: [
      "provider_unconfigured",
      "skipped_demo",
      "max_retries_exceeded",
    ],
    mutatesExternalState: false,
    requiresProviderHealthy: true,
    safeInDegradedMode: false,
    regulatedExecutionAllowed: false,
  },
  "queue.reconciliation": {
    jobType: "queue.reconciliation",
    retryable: false,
    maxRetries: 0,
    timeoutMs: 30_000,
    deadLetterConditions: ["manual_review_required", "stale_orphaned"],
    mutatesExternalState: false,
    requiresProviderHealthy: false,
    safeInDegradedMode: true,
    regulatedExecutionAllowed: false,
  },
};

const handlers = new Map<string, WorkerHandler>();

export function registerWorkerHandler(
  jobType: string,
  handler: WorkerHandler
): void {
  if (!jobTypeRegistry[jobType])
    throw new Error(`Unregistered worker job type: ${jobType}`);
  handlers.set(jobType, handler);
}

export function getJobTypeMetadata(jobType: string): WorkerOperationMetadata {
  const metadata = jobTypeRegistry[jobType];
  if (!metadata) throw new Error(`Unregistered worker job type: ${jobType}`);
  return metadata;
}

export async function executeJob(
  job: WorkerJob,
  input: { workerId: string; handler?: WorkerHandler } = { workerId: "worker" }
): Promise<{
  status: "completed" | "already_completed" | "failed" | "dead_letter";
  job: WorkerJob;
}> {
  if (job.status === "completed") return { status: "already_completed", job };

  const metadata = getJobTypeMetadata(job.jobType);
  if (metadata.governanceBoundary) assertAITaskAllowed(job.jobType);
  const handler = input.handler ?? handlers.get(job.jobType);
  if (!handler) {
    const dead = deadLetterJob(job.id, {
      reason: `No explicit handler registered for ${job.jobType}`,
      deadLetterClass: "non_retryable",
      actor: input.workerId,
    });
    return { status: "dead_letter", job: dead };
  }

  markJobRunning(job.id, input.workerId);
  heartbeatJob(job.id, { workerId: input.workerId });

  try {
    const result = await withTimeout(
      Promise.resolve(handler(job)),
      metadata.timeoutMs
    );
    if (metadata.governanceBoundary) {
      try {
        await auditAIDecision({
          taskType: job.jobType,
          input: job.payloadJson,
          output: result ?? {},
          regulatedEntityRef: job.relatedEntityType
            ? `${job.relatedEntityType}:${job.relatedEntityId ?? "unknown"}`
            : null,
          correlationId: job.correlationId,
        });
      } catch (governanceError) {
        const reason =
          governanceError instanceof Error
            ? governanceError.message
            : String(governanceError);
        const dead = deadLetterJob(job.id, {
          reason,
          deadLetterClass: "non_retryable",
          actor: input.workerId,
        });
        return { status: "dead_letter", job: dead };
      }
    }
    if (isUnsafeProviderSuccess(result)) {
      const dead = deadLetterJob(job.id, {
        reason: `Unsafe provider result cannot be treated as success: ${JSON.stringify(result)}`,
        deadLetterClass: "provider_unavailable",
        actor: input.workerId,
      });
      return { status: "dead_letter", job: dead };
    }
    const completed = completeJob(job.id, {
      workerId: input.workerId,
      result: result && typeof result === "object" ? result : {},
    });
    return { status: "completed", job: completed };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const failed = failJob(job.id, {
      reason,
      retryable: metadata.retryable,
      workerId: input.workerId,
      deadLetterClass: classifyRuntimeFailure(reason),
    });
    return {
      status: failed.status === "dead_letter" ? "dead_letter" : "failed",
      job: failed,
    };
  }
}

export async function runWorkerOnce(
  input: { queueName?: string; workerId: string; handler?: WorkerHandler } = {
    workerId: "worker",
  }
): Promise<{ processed: number; job?: WorkerJob; status?: string }> {
  const job = reserveJob({
    queueName: input.queueName,
    workerId: input.workerId,
  });
  if (!job) return { processed: 0 };
  const result = await executeJob(job, {
    workerId: input.workerId,
    handler: input.handler,
  });
  return { processed: 1, job: result.job, status: result.status };
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs?: number
): Promise<T> {
  if (!timeoutMs) return promise;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Worker job timed out after ${timeoutMs}ms`)),
          timeoutMs
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function classifyRuntimeFailure(reason: string): DeadLetterClass {
  const normalized = reason.toLowerCase();
  if (
    normalized.includes("provider_unconfigured") ||
    normalized.includes("skipped_demo") ||
    normalized.includes("demo_skipped")
  )
    return "provider_unavailable";
  if (normalized.includes("poison") || normalized.includes("invalid payload"))
    return "poison_payload";
  return "unknown";
}
