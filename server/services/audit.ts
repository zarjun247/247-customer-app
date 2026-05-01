import { writeAuditLog as writeDbAuditLog } from "../db";

export async function writeAuditLog(params: {
  actorId: number;
  actorRole?: string | null;
  action: string;
  entityType: string;
  entityId: number;
  before?: unknown;
  after?: unknown;
  reason?: string;
  sourceChannel?: string;
}) {
  await writeDbAuditLog({
    actor: { id: params.actorId, role: params.actorRole ?? undefined, type: "user" },
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    before: params.before,
    after: params.after,
    reason: params.reason,
    channel: params.sourceChannel ?? "app",
  });
}
