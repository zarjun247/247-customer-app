import { writeAuditLog } from "../db";
export async function logAuditEvent(params: {actorId:number|null;actorRole?:string|null;actorType?:string;action:string;entityType:string;entityId:number;before?:unknown;after?:unknown;reason?:string;sourceChannel?:string;ipAddress?:string;sessionId?:string;deviceId?:string;}) {
  await writeAuditLog({ actor: { id: params.actorId, role: params.actorRole ?? undefined, type: params.actorType ?? "user" }, action: params.action, entityType: params.entityType, entityId: params.entityId, before: params.before, after: params.after, reason: params.reason, channel: params.sourceChannel, ipAddress: params.ipAddress, sessionId: params.sessionId, deviceId: params.deviceId });
}
