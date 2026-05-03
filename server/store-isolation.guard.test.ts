import { execSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('store isolation static guards', () => {
  it('has central rbac helpers', () => {
    const out = execSync("rg -n 'requireStoreAccess|requireStaffStore|assertCanCrossStore' server/_core/rbac.ts", {encoding:'utf8'}).trim();
    expect(out.length).toBeGreaterThan(0);
  });

  it('high risk routers include active store access checks', () => {
    const out = execSync("rg -n 'requireStoreAccess\\(' server/routers/inventoryRouter.ts server/routers/purchaseRouter.ts server/routers/salesRouter.ts server/routers/reportsRouter.ts server/routers/deliveryRouter.ts || true", {encoding:'utf8'}).trim();
    expect(out.length).toBeGreaterThan(0);
  });

  it('blocks default store fallback patterns', () => {
    const out = execSync("rg -n 'storeId\\s*\\?\\?\\s*1|storeId\\s*\\|\\|\\s*1|staffStoreId\\s*\\?\\?\\s*1|staffStoreId\\s*\\|\\|\\s*1' server/routers server/_core || true", {encoding:'utf8'}).trim();
    expect(out).toBe('');
  });

  it('fails if requireStoreAccess import is unused in touched routers', () => {
    const out = execSync("for f in server/routers/deliveryRouter.ts server/routers/reportsRouter.ts; do rg -n 'import .*requireStoreAccess' $f >/dev/null && rg -n 'requireStoreAccess\\(' $f >/dev/null || echo $f; done", {encoding:'utf8'}).trim();
    expect(out).toBe('');
  });
});
