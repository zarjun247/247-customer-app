import crypto from "crypto";
import {
  buildRateLimitKey,
  defaultRateLimitStore,
  getProductionRateLimitPosture,
  type RateLimitHit,
  type RateLimitPolicy,
  type RateLimitStore,
} from "./rateLimitService";

export type AbuseDecision =
  | "allow"
  | "throttle"
  | "block"
  | "suspicious"
  | "captcha_required";
export type AbuseReason =
  | "otp_spam"
  | "login_bruteforce"
  | "upload_abuse"
  | "cart_spam"
  | "checkout_spam"
  | "webhook_replay"
  | "admin_bruteforce"
  | "suspicious_velocity"
  | "provider_signature_failure";
export type AbuseSeverity = "info" | "low" | "medium" | "high" | "critical";
export type AbuseAction =
  | "otp.send"
  | "otp.verify"
  | "auth.login"
  | "prescription.upload"
  | "cart.upsert"
  | "checkout.create"
  | "admin.auth"
  | "admin.unauthorized"
  | "webhook.provider";

export interface AbuseActor {
  ip?: string | null;
  userId?: number | string | null;
  phone?: string | null;
  deviceId?: string | null;
  sessionId?: string | null;
  route?: string | null;
  action: string;
}

export interface AbuseCheckInput {
  actor: AbuseActor;
  reason: AbuseReason;
  policy?: RateLimitPolicy;
  store?: RateLimitStore;
  now?: number;
  meta?: Record<string, unknown>;
}

export interface AbuseCheckResult {
  decision: AbuseDecision;
  reason: AbuseReason;
  key: string;
  rateLimit: RateLimitHit;
  captchaDocumented: boolean;
  productionPosture: ReturnType<typeof getProductionRateLimitPosture>;
}

export interface SuspiciousActivityEvent {
  requestId?: string | null;
  actorId?: number | string | null;
  ipHash?: string | null;
  phoneHash?: string | null;
  phoneMasked?: string | null;
  route?: string | null;
  action: string;
  reason: AbuseReason;
  severity: AbuseSeverity;
  timestamp: string;
  details?: Record<string, unknown>;
}

export const ABUSE_POLICIES: Record<string, RateLimitPolicy> = {
  otpSend: { windowMs: 15 * 60_000, max: 5, blockMs: 15 * 60_000 },
  otpVerify: { windowMs: 15 * 60_000, max: 8, blockMs: 15 * 60_000 },
  login: { windowMs: 15 * 60_000, max: 10, blockMs: 15 * 60_000 },
  upload: { windowMs: 60 * 60_000, max: 20, blockMs: 30 * 60_000 },
  cartUpsert: { windowMs: 10 * 60_000, max: 120, blockMs: 10 * 60_000 },
  checkout: { windowMs: 15 * 60_000, max: 12, blockMs: 15 * 60_000 },
  adminAuth: { windowMs: 15 * 60_000, max: 6, blockMs: 30 * 60_000 },
  webhookSignatureFailure: {
    windowMs: 10 * 60_000,
    max: 25,
    blockMs: 10 * 60_000,
  },
  webhookReplay: {
    windowMs: 24 * 60 * 60_000,
    max: 1,
    blockMs: 24 * 60 * 60_000,
  },
};

const SENSITIVE_DETAIL_KEYS =
  /otp|code|password|token|cookie|authorization|signature|secret|image|base64|prescription|medical|payload/i;
const recentWebhookEvents = new Map<string, number>();
const WEBHOOK_REPLAY_TTL_MS = 24 * 60 * 60_000;

function hashValue(value: string): string {
  const salt =
    process.env.ABUSE_LOG_HASH_SALT ||
    process.env.JWT_SECRET ||
    "local-abuse-log-salt";
  return crypto
    .createHmac("sha256", salt)
    .update(value)
    .digest("hex")
    .slice(0, 24);
}

export function maskPhone(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "[PHONE]";
  return `[PHONE:${digits.slice(-4)}]`;
}

export function sanitizeIp(ip?: string | null): string | null {
  if (!ip) return null;
  return hashValue(ip);
}

export function sanitizeAbuseDetails(
  details: Record<string, unknown> = {}
): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (SENSITIVE_DETAIL_KEYS.test(key)) {
      safe[key] = "[REDACTED]";
    } else if (
      typeof value === "string" &&
      /data:(image|application\/pdf)|bearer\s+|cookie:|signature=|otp=|password=/i.test(
        value
      )
    ) {
      safe[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      safe[key] = sanitizeAbuseDetails(value as Record<string, unknown>);
    } else {
      safe[key] = value;
    }
  }
  return safe;
}

export function buildActorKey(actor: AbuseActor, reason: AbuseReason): string {
  return buildRateLimitKey({
    reason,
    action: actor.action,
    route: actor.route,
    userId: actor.userId,
    phone: actor.phone ? hashValue(actor.phone.replace(/\D/g, "")) : undefined,
    ip: actor.ip ? hashValue(actor.ip) : undefined,
    deviceId: actor.deviceId ? hashValue(actor.deviceId) : undefined,
    sessionId: actor.sessionId ? hashValue(actor.sessionId) : undefined,
  });
}

export async function checkAbuse(
  input: AbuseCheckInput
): Promise<AbuseCheckResult> {
  const store = input.store ?? defaultRateLimitStore;
  const key = buildActorKey(input.actor, input.reason);
  const policy = input.policy ??
    ABUSE_POLICIES.suspiciousVelocity ?? { windowMs: 60_000, max: 60 };
  const rateLimit = await store.hit(key, policy, input.now);
  const decision: AbuseDecision = rateLimit.allowed
    ? "allow"
    : input.reason === "provider_signature_failure" ||
        input.reason === "webhook_replay"
      ? "suspicious"
      : "throttle";
  return {
    decision,
    reason: input.reason,
    key,
    rateLimit,
    captchaDocumented: !rateLimit.allowed,
    productionPosture: getProductionRateLimitPosture(),
  };
}

export function checkOtpSend(
  actor: Omit<AbuseActor, "action">,
  store?: RateLimitStore,
  now?: number
) {
  return checkAbuse({
    actor: { ...actor, action: "otp.send" },
    reason: "otp_spam",
    policy: ABUSE_POLICIES.otpSend,
    store,
    now,
  });
}

export function checkOtpVerifyFailure(
  actor: Omit<AbuseActor, "action">,
  store?: RateLimitStore,
  now?: number
) {
  return checkAbuse({
    actor: { ...actor, action: "otp.verify" },
    reason: "login_bruteforce",
    policy: ABUSE_POLICIES.otpVerify,
    store,
    now,
  });
}

export function checkUploadAttempt(
  actor: Omit<AbuseActor, "action">,
  store?: RateLimitStore,
  now?: number
) {
  return checkAbuse({
    actor: { ...actor, action: "prescription.upload" },
    reason: "upload_abuse",
    policy: ABUSE_POLICIES.upload,
    store,
    now,
  });
}

export function checkCartUpsert(
  actor: Omit<AbuseActor, "action">,
  store?: RateLimitStore,
  now?: number
) {
  return checkAbuse({
    actor: { ...actor, action: "cart.upsert" },
    reason: "cart_spam",
    policy: ABUSE_POLICIES.cartUpsert,
    store,
    now,
  });
}

export function checkCheckoutAttempt(
  actor: Omit<AbuseActor, "action">,
  store?: RateLimitStore,
  now?: number
) {
  return checkAbuse({
    actor: { ...actor, action: "checkout.create" },
    reason: "checkout_spam",
    policy: ABUSE_POLICIES.checkout,
    store,
    now,
  });
}

export function checkAdminBruteforce(
  actor: Omit<AbuseActor, "action">,
  store?: RateLimitStore,
  now?: number
) {
  return checkAbuse({
    actor: { ...actor, action: "admin.auth" },
    reason: "admin_bruteforce",
    policy: ABUSE_POLICIES.adminAuth,
    store,
    now,
  });
}

export function checkWebhookSignatureFailure(
  actor: Omit<AbuseActor, "action">,
  store?: RateLimitStore,
  now?: number
) {
  return checkAbuse({
    actor: { ...actor, action: "webhook.provider" },
    reason: "provider_signature_failure",
    policy: ABUSE_POLICIES.webhookSignatureFailure,
    store,
    now,
  });
}

export async function checkWebhookReplay(
  provider: string,
  eventId: string,
  now = Date.now()
): Promise<AbuseCheckResult> {
  for (const [key, seenAt] of Array.from(recentWebhookEvents.entries())) {
    if (now - seenAt > WEBHOOK_REPLAY_TTL_MS) recentWebhookEvents.delete(key);
  }
  const actor = {
    action: "webhook.provider",
    route: provider,
    deviceId: eventId,
  };
  const firstSeenKey = `${provider}:${eventId}`;
  const replay = recentWebhookEvents.has(firstSeenKey);
  recentWebhookEvents.set(firstSeenKey, now);
  const store = defaultRateLimitStore;
  const result = await checkAbuse({
    actor,
    reason: "webhook_replay",
    policy: ABUSE_POLICIES.webhookReplay,
    store,
    now,
  });
  return replay
    ? { ...result, decision: "suspicious" }
    : { ...result, decision: "allow" };
}

export function createSuspiciousActivityEvent(input: {
  requestId?: string | null;
  actor?: AbuseActor;
  reason: AbuseReason;
  severity?: AbuseSeverity;
  details?: Record<string, unknown>;
}): SuspiciousActivityEvent {
  return {
    requestId: input.requestId ?? null,
    actorId: input.actor?.userId ?? null,
    ipHash: sanitizeIp(input.actor?.ip),
    phoneHash: input.actor?.phone
      ? hashValue(input.actor.phone.replace(/\D/g, ""))
      : null,
    phoneMasked: maskPhone(input.actor?.phone),
    route: input.actor?.route ?? null,
    action: String(input.actor?.action ?? "unknown"),
    reason: input.reason,
    severity: input.severity ?? "medium",
    timestamp: new Date().toISOString(),
    details: sanitizeAbuseDetails(input.details),
  };
}

export function logSuspiciousActivity(
  event: SuspiciousActivityEvent,
  logger: Pick<Console, "warn"> = console
): void {
  logger.warn("security.suspicious_activity", event);
}

export function resetAbuseProtectionForTests(): void {
  defaultRateLimitStore.reset();
  recentWebhookEvents.clear();
}
