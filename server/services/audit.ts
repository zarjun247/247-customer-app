import { writeAuditLog } from "../db";

type CtxLike = { user?: { id?: number; role?: string | null }; req?: { headers?: Record<string, string | string[] | undefined>; ip?: string }; session?: { id?: string } };
export interface LogAuditInput { action: string; entityType?: string; entityId?: number | null; actorType?: string; actorId?: number | null; actorRole?: string | null; storeId?: number | null; source?: string; beforeJson?: unknown; afterJson?: unknown; reason?: string; metadata?: unknown; ipAddress?: string | null; userAgent?: string | null; }

export async function logAudit(input: LogAuditInput, ctx?: CtxLike) {
  const headers = ctx?.req?.headers ?? {};
  const userAgent = input.userAgent ?? (Array.isArray(headers["user-agent"]) ? headers["user-agent"][0] : headers["user-agent"]) ?? null;
  const ipAddress = input.ipAddress ?? ctx?.req?.ip ?? (Array.isArray(headers["x-forwarded-for"]) ? headers["x-forwarded-for"][0] : headers["x-forwarded-for"]) ?? null;
  await writeAuditLog({
    actor: { id: input.actorId ?? ctx?.user?.id ?? null, role: input.actorRole ?? ctx?.user?.role ?? undefined, type: input.actorType ?? "user" },
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? undefined,
    before: input.beforeJson,
    after: input.afterJson,
    reason: input.reason,
    payload: { ...(input.storeId ? { storeId: input.storeId } : {}), ...(input.metadata && typeof input.metadata === "object" ? input.metadata as object : input.metadata ? { metadata: input.metadata } : {}) },
    channel: input.source ?? "app",
    ipAddress: ipAddress ?? undefined,
    sessionId: ctx?.session?.id,
    deviceId: userAgent ?? undefined,
  });
}
