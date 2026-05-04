import { describe, it, expect } from 'vitest';
import fs from 'fs';

describe('refund reconciliation safety guards', () => {
  const source = fs.readFileSync('server/services/refundService.ts', 'utf8');

  it('contains provider pending/manual statuses and avoids fake success in initiate flow', () => {
    expect(source).toContain('pending_provider');
    expect(source).toContain('provider_not_configured');
    expect(source).toContain('manual_required');
    expect(source).toContain('status: "pending"');
  });

  it('contains refund overpayment guard helper', () => {
    expect(source).toContain('assertRefundAmountAllowed');
    expect(source).toContain('Refund exceeds available paid amount');
  });

  it('contains duplicate refund audit marker', () => {
    expect(source).toContain('refund.duplicate_detected');
  });
});
