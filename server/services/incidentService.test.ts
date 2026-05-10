import { describe, it, expect, vi } from 'vitest';

vi.mock('../db', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }));

import { writeAuditLog } from '../db';
import { createIncident, transitionIncident } from './incidentService';

describe('incidentService', () => {
  it('creates an incident and writes an audit log', async () => {
    const inc = await createIncident({ title: 'Test incident', description: 'desc', severity: 'warning' } as any, { user: { id: 3, role: 'admin' } });
    expect(inc.title).toBe('Test incident');
    expect(writeAuditLog).toHaveBeenCalled();
    const arg = (writeAuditLog as any).mock.calls[0][0];
    expect(arg.action).toBe('incident.created');
  });

  it('transitions an incident', async () => {
    await transitionIncident(123, 'acknowledged' as any, 'taking ownership', { user: { id: 4, role: 'ops_admin' } });
    expect(writeAuditLog).toHaveBeenCalled();
    const arg = (writeAuditLog as any).mock.calls[(writeAuditLog as any).mock.calls.length - 1][0];
    expect(arg.action).toBe('incident.transitioned');
    // logAudit maps input.metadata into the writeAuditLog 'payload' field
    expect(arg.payload.newStatus).toBe('acknowledged');
  });
});
