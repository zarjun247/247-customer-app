import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

describe('whatsapp/refill/vault guards', () => {
  const wa = fs.readFileSync('server/routers/whatsappRouter.ts', 'utf8');
  const refill = fs.readFileSync('server/routers.ts', 'utf8');
  it('whatsapp regulated intents are escalated without auto-approval', () => {
    expect(wa).toContain('whatsapp.regulated_escalated');
    expect(wa.toLowerCase()).toContain('regulated medicine request received');
  });
  it('regulated refill reorder remains draft-only and audited', () => {
    expect(refill).toContain('autoConfirmedSale: false');
    expect(refill).toContain('refill.regulated_review_required');
  });
  it('prescription detail access is audited', () => {
    expect(refill).toContain('prescription_viewed');
  });
});
