import { writeAuditLog } from "../db";

export type AuditCtx = {
  userId: number | null;
  role?: string | null;
  ipAddress?: string;
  sessionId?: string;
  deviceId?: string;
  sourceChannel?: string;
};

export async function writeAuditEvent(params: {
  ctx: AuditCtx;
  action: string;
  entityType: string;
  entityId: number;
  before?: unknown;
  after?: unknown;
  reason?: string;
}) {
  const { ctx, action, entityType, entityId, before, after, reason } = params;
  await writeAuditLog({
    actor: { id: ctx.userId, role: ctx.role ?? undefined, type: ctx.role ?? "user" },
    action,
    entityType,
    entityId,
    before,
    after,
    reason,
    channel: ctx.sourceChannel ?? "system",
    ipAddress: ctx.ipAddress,
    sessionId: ctx.sessionId,
    deviceId: ctx.deviceId,
  });
}
