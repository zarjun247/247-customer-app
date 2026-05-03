import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';

const routersWithNoLocalAuditHelpers = ['server/routers/inventoryRouter.ts', 'server/routers/prescriptionGovRouter.ts', 'server/routers/ocrIngestionRouter.ts'];
const pendingRouters = [
  'server/routers/masterDataRouter.ts',
  'server/routers/masterDataPart3Router.ts',
];

describe('audit unification static guard', () => {
  it('blocks direct db.insert(auditLogs) outside central audit service/db adapters', () => {
    let out = '';
    try {
      out = execSync(
        "rg -n \"db\\.insert\\(auditLogs\" server --glob '!server/services/audit.ts' --glob '!server/db.ts' --glob '!server/audit-unification.guard.test.ts'",
        { encoding: 'utf8' },
      ).trim();
    } catch (e: any) {
      out = e?.stdout?.toString?.().trim?.() ?? '';
    }
    expect(out).toBe('');
  });

  it('blocks router-local audit helper wrappers for completed routers only', () => {
    const helperPattern =
      'async function writeAudit|async function writeAuditLog|async function recordAuditEvent|async function createAuditLog|async function logAudit';

    let out = '';
    try {
      out = execSync(`rg -n "${helperPattern}" ${routersWithNoLocalAuditHelpers.join(' ')}`, {
        encoding: 'utf8',
      }).trim();
    } catch (e: any) {
      out = e?.stdout?.toString?.().trim?.() ?? '';
    }

    expect(out).toBe('');
    expect(pendingRouters.length).toBeGreaterThan(0);
  });

  it('blocks entityId: 0 in production router audit contexts', () => {
    let out = '';
    try {
      out = execSync(
        "rg -n \"entityId:\\s*0\" server/routers --glob '!**/*.test.ts'",
        { encoding: 'utf8' },
      ).trim();
    } catch (e: any) {
      out = e?.stdout?.toString?.().trim?.() ?? '';
    }
    expect(out).toBe('');
  });
});
