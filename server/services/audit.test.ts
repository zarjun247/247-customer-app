import { describe, it, expect, vi } from 'vitest';

vi.mock('../db', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }));

import { writeAuditLog } from '../db';
import { logAudit } from './audit';

describe('logAudit', () => {
  it('writes audit row with context', async () => {
    await logAudit({ action: 'sale.created', entityType: 'sale', entityId: 11, metadata: { a: 1 } }, { user: { id: 7, role: 'admin' }, req: { headers: { 'user-agent': 'ua' }, ip: '1.1.1.1' } });
    expect(writeAuditLog).toHaveBeenCalled();
    const arg = (writeAuditLog as any).mock.calls[0][0];
    expect(arg.action).toBe('sale.created');
    expect(arg.entityType).toBe('sale');
    expect(arg.entityId).toBe(11);
    expect(arg.actor.id).toBe(7);
  });
});
