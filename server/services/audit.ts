import { z } from "zod";
import { writeAuditLog as dbWriteAuditLog } from "./db";

const auditSchema = z.object({
  actorId: z.number().int(),
  actorRole: z.string().min(1),
  actorType: z.string().min(1).default("user"),
  action: z.string().min(1),
  entityType: z.string().min(1),
  entityId: z.number().int().positive(),
  beforeJson: z.unknown().optional(),
  afterJson: z.unknown().optional(),
  reason: z.string().min(1),
  sourceChannel: z.string().min(1),
  ipAddress: z.string().min(1),
  sessionId: z.string().min(1),
  deviceId: z.string().min(1),
});

export type CentralAuditInput = z.infer<typeof auditSchema>;

export async function writeCentralAudit(input: CentralAuditInput) {
  const p = auditSchema.parse(input);
  await dbWriteAuditLog({
    actor: { id: p.actorId, role: p.actorRole, type: p.actorType },
    action: p.action,
    entityType: p.entityType,
    entityId: p.entityId,
    before: p.beforeJson,
    after: p.afterJson,
    reason: p.reason,
    channel: p.sourceChannel,
    ipAddress: p.ipAddress,
    sessionId: p.sessionId,
    deviceId: p.deviceId,
  });
}
