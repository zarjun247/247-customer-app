import { describe,it,expect } from 'vitest';
import fs from 'node:fs';

describe('safety regressions',()=>{
  it('OTP session signing uses ENV.appId and no production devCode leak',()=>{
    const src=fs.readFileSync('server/routers.ts','utf8');
    expect(src).toContain('appId: ENV.appId');
    expect(src).toContain('devCode: !ENV.isProduction ? code : undefined');
  });

  it('dosage APIs use ctx.user.id ownership checks',()=>{
    const src=fs.readFileSync('server/routers.ts','utf8');
    expect(src).toContain('recordDoseTaken(ctx.user.id');
    expect(src).toContain('recordDoseSkipped(ctx.user.id');
    expect(src).toContain('getAdherenceSummary(ctx.user.id');
    expect(src).toContain('estimateMedicationRemaining(ctx.user.id');
  });

  it('checkout has soft-lock release on failure path',()=>{
    const src=fs.readFileSync('server/routers.ts','utf8');
    expect(src).toContain('await releaseSoftLock(lockItems);');
  });
});
