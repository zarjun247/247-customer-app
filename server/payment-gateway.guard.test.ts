import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { verifyGatewayWebhookSignature } from './services/paymentGateway';
import { assertPaymentWebhookRoutePosture } from './_core/env';

describe('payment gateway guards', () => {
  it('rejects webhook when disabled', () => {
    process.env.PAYMENT_WEBHOOK_ENABLED = 'false';
    expect(() => verifyGatewayWebhookSignature('{}', 'abc')).toThrow();
  });

  it('verifies webhook signature when enabled', () => {
    process.env.PAYMENT_WEBHOOK_ENABLED = 'true';
    process.env.RAZORPAY_WEBHOOK_SECRET = 's3cr3t';
    const body = '{"event":"payment.captured"}';
    const sig = crypto.createHmac('sha256', 's3cr3t').update(body).digest('hex');
    expect(verifyGatewayWebhookSignature(body, sig)).toBe(true);
  });

  it('fails closed when webhook enabled without implemented route marker', () => {
    process.env.PAYMENT_WEBHOOK_ENABLED = 'true';
    process.env.PAYMENT_WEBHOOK_ROUTE_IMPLEMENTED = 'false';
    const errors: string[] = [];
    assertPaymentWebhookRoutePosture(errors);
    expect(errors).toContain('PAYMENT_WEBHOOK_ENABLED_UNSUPPORTED_WITHOUT_VERIFIED_ROUTE');
  });
});
