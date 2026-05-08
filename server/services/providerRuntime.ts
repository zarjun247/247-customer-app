import crypto from "crypto";
import { evaluateProviderStatus } from "./providerContract";
import {
  recordProviderAttempt,
  recordProviderDeadLetter,
  type ProviderAttemptInput,
} from "./providerDeadLetter";

export type ProviderRuntimeStatus =
  | "success"
  | "failed"
  | "provider_unconfigured"
  | "disabled"
  | "demo_skipped"
  | "preview_only"
  | "retry_scheduled"
  | "dead_letter"
  | "timeout"
  | "rate_limited"
  | "unknown";

export type ProviderFailureType =
  | "network"
  | "timeout"
  | "rate_limited"
  | "provider_5xx"
  | "provider_4xx"
  | "unconfigured"
  | "disabled"
  | "demo"
  | "preview"
  | "validation"
  | "unknown";

export type ProviderOperationName =
  | "sms.send"
  | "whatsapp.send"
  | "email.send"
  | "push.send"
  | "payment.createOrder"
  | "payment.verify"
  | "payment.refund"
  | "storage.upload"
  | "storage.download"
  | "ocr.parse"
  | "printer.printBatchLabel"
  | "printer.printDispatchLabel"
  | "tally.export"
  | "maps.geocode"
  | "maps.distance"
  | string;

export type ProviderOperationPolicy = {
  operation: ProviderOperationName;
  provider: string;
  productionRequired: boolean;
  idempotencyRequired: boolean;
  retryableFailureTypes: ProviderFailureType[];
  maxRetryCount: number;
  deadLetterCondition: "never" | "non_success" | "non_retryable" | "retry_exhausted";
  demoPreviewAllowedOutsideProduction: boolean;
  mutatesExternalState: boolean;
};

export type NormalizedProviderResult = {
  provider: string;
  operation: ProviderOperationName;
  idempotencyKey: string;
  status: ProviderRuntimeStatus;
  ok: boolean;
  realSuccess: boolean;
  retryable: boolean;
  attemptNo: number;
  maxAttempts: number;
  failureType?: ProviderFailureType;
  reason?: string;
  nextRetryAt?: Date | null;
  deadLetterReason?: string | null;
  correlationId?: string;
  metadata?: Record<string, unknown>;
  responseSummary?: Record<string, unknown>;
};

const defaultMaxRetryCount = 3;

export const providerOperationRegistry: Record<string, ProviderOperationPolicy> = {
  "sms.send": policy("sms", "sms.send", true, true, ["network", "timeout", "rate_limited", "provider_5xx"], 3, "retry_exhausted", true, true),
  "whatsapp.send": policy("whatsapp", "whatsapp.send", true, true, ["network", "timeout", "rate_limited", "provider_5xx"], 3, "retry_exhausted", true, true),
  "email.send": policy("email", "email.send", false, true, ["network", "timeout", "rate_limited", "provider_5xx"], 3, "retry_exhausted", true, true),
  "push.send": policy("push_notification", "push.send", false, true, ["network", "timeout", "rate_limited", "provider_5xx"], 3, "retry_exhausted", true, true),
  "payment.createOrder": policy("razorpay_payment", "payment.createOrder", true, true, ["network", "timeout", "rate_limited", "provider_5xx"], 1, "retry_exhausted", false, true),
  "payment.verify": policy("razorpay_payment", "payment.verify", true, true, [], 0, "non_success", false, false),
  "payment.refund": policy("razorpay_payment", "payment.refund", true, true, ["network", "timeout", "rate_limited", "provider_5xx"], 1, "retry_exhausted", false, true),
  "storage.upload": policy("object_storage", "storage.upload", true, true, ["network", "timeout", "rate_limited", "provider_5xx"], 3, "retry_exhausted", false, true),
  "storage.download": policy("object_storage", "storage.download", true, false, ["network", "timeout", "rate_limited", "provider_5xx"], 2, "retry_exhausted", false, false),
  "ocr.parse": policy("ocr", "ocr.parse", false, true, ["network", "timeout", "rate_limited", "provider_5xx"], 2, "retry_exhausted", false, false),
  "printer.printBatchLabel": policy("printer_label_printing", "printer.printBatchLabel", false, true, ["network", "timeout", "provider_5xx"], 2, "retry_exhausted", true, true),
  "printer.printDispatchLabel": policy("printer_label_printing", "printer.printDispatchLabel", false, true, ["network", "timeout", "provider_5xx"], 2, "retry_exhausted", true, true),
  "tally.export": policy("tally_erp_export", "tally.export", false, true, ["network", "timeout", "rate_limited", "provider_5xx"], 3, "retry_exhausted", true, true),
  "maps.geocode": policy("maps_geocoding_delivery_distance", "maps.geocode", false, false, ["network", "timeout", "rate_limited", "provider_5xx"], 2, "non_retryable", true, false),
  "maps.distance": policy("maps_geocoding_delivery_distance", "maps.distance", false, false, ["network", "timeout", "rate_limited", "provider_5xx"], 2, "non_retryable", true, false),
};

function policy(provider: string, operation: string, productionRequired: boolean, idempotencyRequired: boolean, retryableFailureTypes: ProviderFailureType[], maxRetryCount: number, deadLetterCondition: ProviderOperationPolicy["deadLetterCondition"], demoPreviewAllowedOutsideProduction: boolean, mutatesExternalState: boolean): ProviderOperationPolicy {
  return { provider, operation, productionRequired, idempotencyRequired, retryableFailureTypes, maxRetryCount, deadLetterCondition, demoPreviewAllowedOutsideProduction, mutatesExternalState };
}

export function getProviderOperationPolicy(operation: ProviderOperationName): ProviderOperationPolicy {
  return providerOperationRegistry[operation] ?? policy("unknown", operation, false, true, ["network", "timeout", "rate_limited", "provider_5xx"], defaultMaxRetryCount, "retry_exhausted", false, true);
}

const sensitiveKeyPattern = /(authorization|authkey|api[-_]?key|secret|token|signature|password|private[-_]?key|credential|cookie|set-cookie|x-api-key)/i;

export function redactProviderPayload(payload: unknown): unknown {
  if (payload === null || payload === undefined) return payload;
  if (typeof payload === "string") return payload.length > 256 ? `${payload.slice(0, 256)}…` : payload;
  if (typeof payload !== "object") return payload;
  if (Array.isArray(payload)) return payload.map(item => redactProviderPayload(item));
  return Object.fromEntries(Object.entries(payload as Record<string, unknown>).map(([key, value]) => [
    key,
    sensitiveKeyPattern.test(key) ? "[REDACTED]" : redactProviderPayload(value),
  ]));
}

function inferFailureType(raw: any, status: ProviderRuntimeStatus): ProviderFailureType | undefined {
  if (raw?.failureType) return raw.failureType;
  if (status === "timeout") return "timeout";
  if (status === "rate_limited") return "rate_limited";
  if (status === "provider_unconfigured") return "unconfigured";
  if (status === "disabled") return "disabled";
  if (status === "demo_skipped") return "demo";
  if (status === "preview_only") return "preview";
  const code = Number(raw?.httpStatus ?? raw?.statusCode ?? 0);
  if (code === 429) return "rate_limited";
  if (code >= 500) return "provider_5xx";
  if (code >= 400) return "provider_4xx";
  return status === "failed" ? "unknown" : undefined;
}

function normalizeStatus(raw: any): ProviderRuntimeStatus {
  const status = String(raw?.status ?? "").toLowerCase();
  if (["success", "sent", "delivered", "stored", "verified", "printed", "synced", "export_generated", "distance_calculated", "ocr_complete_pending_review"].includes(status) && raw?.ok !== false) return "success";
  if (["skipped_demo", "demo_skipped"].includes(status) || raw?.demo === true) return "demo_skipped";
  if (status === "provider_unconfigured" || raw?.configured === false) return "provider_unconfigured";
  if (["disabled", "preview_only", "retry_scheduled", "dead_letter", "timeout", "rate_limited", "failed"].includes(status)) return status as ProviderRuntimeStatus;
  if (raw?.ok === true) return "success";
  if (raw?.ok === false) return "failed";
  return "unknown";
}

export function normalizeProviderResult(rawResult: unknown, context?: { provider?: string; operation?: ProviderOperationName; idempotencyKey?: string; attemptNo?: number; maxAttempts?: number; correlationId?: string }): NormalizedProviderResult {
  const raw = typeof rawResult === "object" && rawResult !== null ? rawResult as Record<string, any> : { ok: rawResult === true, status: rawResult === true ? "success" : rawResult === false ? "failed" : "unknown" };
  const operation = context?.operation ?? raw.operation ?? "unknown";
  const provider = context?.provider ?? raw.provider ?? raw.providerName ?? getProviderOperationPolicy(operation).provider;
  const idempotencyKey = context?.idempotencyKey ?? raw.idempotencyKey ?? crypto.randomUUID();
  const attemptNo = Number(context?.attemptNo ?? raw.attemptNo ?? 1);
  const maxAttempts = Number(context?.maxAttempts ?? raw.maxAttempts ?? getProviderOperationPolicy(operation).maxRetryCount + 1);
  const status = normalizeStatus(raw);
  const failureType = inferFailureType(raw, status);
  const ok = status === "success";
  return {
    provider,
    operation,
    idempotencyKey,
    status,
    ok,
    realSuccess: ok,
    retryable: false,
    attemptNo,
    maxAttempts,
    failureType,
    reason: raw.reason ?? raw.error ?? raw.message,
    correlationId: context?.correlationId ?? raw.correlationId,
    metadata: redactProviderPayload(raw.metadata ?? {}) as Record<string, unknown>,
    responseSummary: redactProviderPayload({ status: raw.status, ok: raw.ok, reason: raw.reason ?? raw.error ?? raw.message, providerMessageId: raw.providerMessageId, erpRef: raw.erpRef }) as Record<string, unknown>,
  };
}

export function shouldRetryProviderResult(result: NormalizedProviderResult, policy: ProviderOperationPolicy): boolean {
  if (result.status === "success" || result.status === "retry_scheduled" || result.status === "dead_letter") return false;
  if (["provider_unconfigured", "disabled", "demo_skipped", "preview_only"].includes(result.status)) return false;
  if (result.attemptNo > policy.maxRetryCount) return false;
  return Boolean(result.failureType && policy.retryableFailureTypes.includes(result.failureType));
}

export function shouldDeadLetterProviderResult(result: NormalizedProviderResult, policy: ProviderOperationPolicy): boolean {
  if (result.status === "success" || result.status === "retry_scheduled") return false;
  if (policy.deadLetterCondition === "never") return false;
  if (policy.deadLetterCondition === "non_success") return true;
  if (policy.deadLetterCondition === "retry_exhausted" && result.retryable && result.attemptNo <= policy.maxRetryCount) return false;
  if (policy.deadLetterCondition === "non_retryable" && result.retryable) return false;
  return result.status !== "provider_unconfigured" || policy.productionRequired;
}

export function classifyProviderResult(result: NormalizedProviderResult, policy = getProviderOperationPolicy(result.operation)): NormalizedProviderResult {
  const retryable = shouldRetryProviderResult(result, policy);
  const nextRetryAt = retryable ? new Date(Date.now() + Math.min(60, Math.pow(2, Math.max(0, result.attemptNo - 1)) * 5) * 1000) : null;
  const withRetry = { ...result, retryable, nextRetryAt };
  const deadLetter = shouldDeadLetterProviderResult(withRetry, policy);
  if (deadLetter) {
    return { ...withRetry, status: "dead_letter", ok: false, realSuccess: false, deadLetterReason: withRetry.reason ?? withRetry.failureType ?? "provider_operation_failed" };
  }
  if (retryable) return { ...withRetry, status: "retry_scheduled", ok: false, realSuccess: false };
  return withRetry;
}

export function assertProviderSuccess(result: NormalizedProviderResult): NormalizedProviderResult {
  if (result.status !== "success" || !result.ok) throw new Error(`Provider operation ${result.provider}.${result.operation} did not succeed: ${result.status}`);
  return result;
}

export function assertRealProviderSuccess(result: NormalizedProviderResult): NormalizedProviderResult {
  if (result.status !== "success" || !result.realSuccess || ["provider_unconfigured", "demo_skipped", "preview_only", "disabled"].includes(result.status)) {
    throw new Error(`Provider operation ${result.provider}.${result.operation} was not a real provider success: ${result.status}`);
  }
  return result;
}

export async function executeProviderOperation<T>(input: {
  provider: string;
  operation: ProviderOperationName;
  idempotencyKey: string;
  attemptNo?: number;
  correlationId?: string;
  relatedEntityType?: string;
  relatedEntityId?: string | number;
  requestPayload?: unknown;
  call: () => Promise<T>;
  policy?: ProviderOperationPolicy;
  auditHook?: (result: NormalizedProviderResult) => Promise<void> | void;
}): Promise<NormalizedProviderResult> {
  const policy = input.policy ?? getProviderOperationPolicy(input.operation);
  if (policy.idempotencyRequired && !input.idempotencyKey) throw new Error(`Provider operation ${input.operation} requires an idempotency key`);
  let raw: unknown;
  try {
    raw = await input.call();
  } catch (error) {
    const err = error as Error & { code?: string; status?: number };
    raw = { ok: false, status: err.name === "AbortError" || /timeout/i.test(err.message) ? "timeout" : err.status === 429 ? "rate_limited" : "failed", reason: err.message, failureType: err.status && err.status >= 500 ? "provider_5xx" : undefined };
  }
  const normalized = normalizeProviderResult(raw, { provider: input.provider, operation: input.operation, idempotencyKey: input.idempotencyKey, attemptNo: input.attemptNo ?? 1, maxAttempts: policy.maxRetryCount + 1, correlationId: input.correlationId });
  const classified = classifyProviderResult(normalized, policy);
  await recordProviderAttempt(buildAttemptInput(classified, input, policy));
  if (classified.status === "dead_letter") await recordProviderDeadLetter(buildAttemptInput(classified, input, policy));
  await input.auditHook?.(classified);
  return classified;
}

function buildAttemptInput(result: NormalizedProviderResult, input: { requestPayload?: unknown; relatedEntityType?: string; relatedEntityId?: string | number }, policy: ProviderOperationPolicy): ProviderAttemptInput {
  const sanitizedRequest = redactProviderPayload(input.requestPayload ?? {});
  return {
    provider: result.provider,
    operation: result.operation,
    idempotencyKey: result.idempotencyKey,
    status: result.status,
    attemptNo: result.attemptNo,
    maxAttempts: policy.maxRetryCount + 1,
    retryable: result.retryable,
    nextRetryAt: result.nextRetryAt ?? null,
    deadLetterReason: result.deadLetterReason ?? null,
    requestHash: crypto.createHash("sha256").update(JSON.stringify(sanitizedRequest)).digest("hex"),
    responseSummaryJson: result.responseSummary ?? {},
    correlationId: result.correlationId ?? null,
    relatedEntityType: input.relatedEntityType ?? null,
    relatedEntityId: input.relatedEntityId === undefined ? null : String(input.relatedEntityId),
  };
}

export function buildProviderRuntimeHealthSummary(env: NodeJS.ProcessEnv = process.env) {
  const contracts = evaluateProviderStatus(env);
  const providers = contracts.map(contract => ({
    provider: contract.providerName,
    status: contract.status === "configured" ? "configured" : contract.status,
    configured: contract.configured,
    productionRequired: contract.productionRequired,
    degraded: contract.productionRequired && contract.status !== "configured",
    missingEnvVarCount: contract.missingEnvVars.length,
  }));
  const countsByStatus = providers.reduce<Record<string, number>>((acc, provider) => {
    acc[provider.status] = (acc[provider.status] ?? 0) + 1;
    return acc;
  }, {});
  return { providers, countsByStatus, recentDeadLetterCount: 0 };
}
