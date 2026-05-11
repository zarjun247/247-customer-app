import { writeAuditLog } from "../db";
import { redactObject, redactString } from "./observability";

type CtxLike = { user?: { id?: number; role?: string | null }; req?: { headers?: Record<string, string | string[] | undefined>; ip?: string }; session?: { id?: string } };
export interface LogAuditInput { action: string; entityType?: string; entityId?: number | null; entityRef?: string | null; actorType?: string; actorId?: number | null; actorRole?: string | null; storeId?: number | null; source?: string; beforeJson?: unknown; afterJson?: unknown; reason?: string; metadata?: unknown; ipAddress?: string | null; userAgent?: string | null; }

const OVERRIDE_ACTION_PATTERN = /(override|manual\.|manual_)/i;

export function requireOverrideReason(action: string, reason?: string): string | undefined {
  if (!OVERRIDE_ACTION_PATTERN.test(action)) return reason;
  const normalized = String(reason ?? "").trim();
  if (normalized.length < 5) throw new Error("override_reason_required");
  return normalized;
}

export async function logAudit(input: LogAuditInput, ctx?: CtxLike) {
  const requiredReason = requireOverrideReason(input.action, input.reason);
  const headers = ctx?.req?.headers ?? {};
  const userAgent = input.userAgent ?? (Array.isArray(headers["user-agent"]) ? headers["user-agent"][0] : headers["user-agent"]) ?? null;
  const ipAddress = input.ipAddress ?? ctx?.req?.ip ?? (Array.isArray(headers["x-forwarded-for"]) ? headers["x-forwarded-for"][0] : headers["x-forwarded-for"]) ?? null;
  await writeAuditLog({
    actor: { id: input.actorId ?? ctx?.user?.id ?? null, role: input.actorRole ?? ctx?.user?.role ?? undefined, type: input.actorType ?? "user" },
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? undefined,
    before: redactObject(input.beforeJson),
    after: redactObject(input.afterJson),
    reason: requiredReason ? redactString(requiredReason).slice(0, 500) : undefined,
    payload: redactObject({ ...(input.storeId ? { storeId: input.storeId } : {}), ...(input.entityRef ? { entityRef: input.entityRef } : {}), ...(input.metadata && typeof input.metadata === "object" ? input.metadata as object : input.metadata ? { metadata: input.metadata } : {}) }),
    channel: input.source ?? "app",
    ipAddress: ipAddress ?? undefined,
    sessionId: ctx?.session?.id,
    deviceId: userAgent ?? undefined,
  });
}
