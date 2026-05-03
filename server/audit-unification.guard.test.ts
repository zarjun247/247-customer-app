import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';

describe('audit insert guard', () => {
  it('prevents direct db.insert(auditLogs) in migrated routers', () => {
    let out = '';
    try {
      out = execSync("rg -n \"db\\.insert\\(auditLogs\" server/routers/salesRouter.ts server/routers/purchaseRouter.ts", { encoding: 'utf8' }).trim();
    } catch {
      out = '';
    }
    expect(out).toBe('');
  });
});
