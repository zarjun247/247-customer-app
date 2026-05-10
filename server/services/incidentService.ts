import { logAudit } from './audit';

export type IncidentSeverity = 'info' | 'warning' | 'critical';
export type IncidentStatus = 'detected' | 'acknowledged' | 'investigating' | 'mitigated' | 'resolved';

export async function createIncident(input: {
  title: string;
  description?: string;
  severity?: IncidentSeverity;
  relatedEntityType?: string | null;
  relatedEntityId?: number | null;
  storeId?: number | null;
}, ctx?: any) {
  const incident = {
    title: input.title,
    description: input.description ?? null,
    severity: input.severity ?? 'warning',
    status: 'detected' as IncidentStatus,
    relatedEntityType: input.relatedEntityType ?? null,
    relatedEntityId: input.relatedEntityId ?? null,
    createdAt: new Date().toISOString(),
  };
  await logAudit({
    action: 'incident.created',
    entityType: 'incident',
    entityId: null,
    afterJson: incident,
    metadata: { severity: incident.severity, relatedEntityType: incident.relatedEntityType, relatedEntityId: incident.relatedEntityId },
  }, ctx);
  return incident;
}

export async function transitionIncident(incidentAuditId: number, newStatus: IncidentStatus, note?: string, ctx?: any) {
  await logAudit({
    action: 'incident.transitioned',
    entityType: 'incident',
    entityId: incidentAuditId,
    reason: note ?? undefined,
    metadata: { newStatus },
    afterJson: { status: newStatus, transitionedAt: new Date().toISOString() },
  }, ctx);
  return { ok: true };
}
