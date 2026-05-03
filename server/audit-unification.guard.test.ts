import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';

describe('audit unification static guard', () => {
  it('blocks direct db.insert(auditLogs) outside central audit service/db adapters', () => {
    let out = '';
    try {
      out = execSync("rg -n \"db\\.insert\\(auditLogs\" server --glob '!server/services/audit.ts' --glob '!server/db.ts'", { encoding: 'utf8' }).trim();
    } catch (e: any) {
      out = e?.stdout?.toString?.().trim?.() ?? '';
    }
    expect(out).toBe('');
  });

  it('blocks router-local audit helper functions in pass-2 routers', () => {
    let out = '';
    try {
      out = execSync("rg -n \"async function writeAudit|async function writeAuditLog|async function logAudit\" server/routers/inventoryRouter.ts server/routers/prescriptionGovRouter.ts server/routers/ocrIngestionRouter.ts server/routers/masterDataRouter.ts server/routers/masterDataPart3Router.ts", { encoding: 'utf8' }).trim();
    } catch (e: any) {
      out = e?.stdout?.toString?.().trim?.() ?? '';
    }
    expect(out).toBe('');
  });

  it('blocks entityId: 0 in router audit contexts', () => {
    let out = '';
    try {
      out = execSync("rg -n \"entityId:\\s*0\" server/routers", { encoding: 'utf8' }).trim();
    } catch (e: any) {
      out = e?.stdout?.toString?.().trim?.() ?? '';
    }
    expect(out).toBe('');
  });
});
