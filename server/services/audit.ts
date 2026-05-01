import type { TrpcContext } from "../_core/context";
import { writeAuditLog as writeDbAuditLog } from "../db";

export function getRequestMeta(ctx?: TrpcContext | null) {
  const req = ctx?.req;
  const ipAddress = (req?.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() || req?.ip;
  const sessionId = (req?.headers["x-session-id"] as string | undefined) || (req?.headers["x-request-id"] as string | undefined);
  const deviceId = (req?.headers["x-device-id"] as string | undefined) || (req?.headers["user-agent"] as string | undefined);
  return { ipAddress, sessionId, deviceId };
}

export async function writeAudit(ctx: TrpcContext, p: {
  action: string; entityType: string; entityId?: number; before?: unknown; after?: unknown; reason?: string; sourceChannel?: string; actorType?: string;
}) {
  await writeDbAuditLog({
    actor: { id: ctx.user?.id ?? null, role: ctx.user?.role ?? undefined, type: p.actorType ?? "user" },
    action: p.action,
    entityType: p.entityType,
    entityId: p.entityId,
    before: p.before,
    after: p.after,
    reason: p.reason,
    channel: p.sourceChannel ?? "api",
    ...getRequestMeta(ctx),
  });
}
