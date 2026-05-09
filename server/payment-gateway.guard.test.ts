import { afterEach, describe, it, expect } from 'vitest';
import crypto from 'crypto';
import {
  markPaymentAuthorized,
  markPaymentRefunded,
  recordPaymentAttempt,
  verifyGatewayPaymentSignature,
  verifyGatewayWebhookSignature,
} from './services/paymentGateway';
import { assertPaymentWebhookRoutePosture } from './_core/env';
import { paymentConnector } from './connectors';
import fs from 'fs';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('payment gateway guards', () => {
  it('rejects webhook when disabled', () => {
    process.env.PAYMENT_WEBHOOK_ENABLED = 'false';
    expect(() => verifyGatewayWebhookSignature('{}', 'abc')).toThrow();
  });

  it('accepts a valid webhook signature when enabled', () => {
    process.env.PAYMENT_WEBHOOK_ENABLED = 'true';
    process.env.RAZORPAY_WEBHOOK_SECRET = 's3cr3t';
    const body = '{"event":"payment.captured"}';
    const sig = crypto.createHmac('sha256', 's3cr3t').update(body).digest('hex');
    expect(verifyGatewayWebhookSignature(body, sig)).toBe(true);
  });

  it('rejects a missing webhook signature safely', () => {
    process.env.PAYMENT_WEBHOOK_ENABLED = 'true';
    process.env.RAZORPAY_WEBHOOK_SECRET = 's3cr3t';
    expect(verifyGatewayWebhookSignature('{}', undefined)).toBe(false);
    expect(verifyGatewayWebhookSignature('{}', '')).toBe(false);
  });

  it('fails closed when webhook enabled without implemented route marker', () => {
    process.env.PAYMENT_WEBHOOK_ENABLED = 'true';
    process.env.PAYMENT_WEBHOOK_ROUTE_IMPLEMENTED = 'false';
    const errors: string[] = [];
    assertPaymentWebhookRoutePosture(errors);
    expect(errors).toContain('PAYMENT_WEBHOOK_ENABLED_UNSUPPORTED_WITHOUT_VERIFIED_ROUTE');
  });

  it('returns false for malformed or unequal-length webhook signatures instead of throwing', () => {
    process.env.PAYMENT_WEBHOOK_ENABLED = 'true';
    process.env.RAZORPAY_WEBHOOK_SECRET = 'abc';
    expect(() => verifyGatewayWebhookSignature('{}', 'short')).not.toThrow();
    expect(verifyGatewayWebhookSignature('{}', 'short')).toBe(false);
    expect(() => verifyGatewayWebhookSignature('{}', 'zz-not-hex')).not.toThrow();
    expect(verifyGatewayWebhookSignature('{}', 'zz-not-hex')).toBe(false);
  });

  it('cannot verify payment when Razorpay secret is missing in production', async () => {
    process.env.RAZORPAY_KEY_SECRET = '';
    process.env.LOCAL_DEMO_MODE = 'false';
    process.env.PAYMENT_DEMO_MODE = 'false';
    process.env.NODE_ENV = 'production';
    await expect(paymentConnector.verifyPayment({ gatewayOrderId: 'o_1', gatewayPaymentId: 'p_1', signature: 'sig' })).rejects.toThrow();
    await expect(verifyGatewayPaymentSignature({ gatewayOrderId: 'o_1', gatewayPaymentId: 'p_1', signature: 'sig' })).resolves.toMatchObject({
      verified: false,
      status: 'not_configured',
    });
  });

  it('does not claim real success when Razorpay secret is missing in explicit demo/test mode', async () => {
    process.env.RAZORPAY_KEY_SECRET = '';
    process.env.PAYMENT_DEMO_MODE = 'true';
    process.env.NODE_ENV = 'test';
    await expect(verifyGatewayPaymentSignature({ gatewayOrderId: 'o_1', gatewayPaymentId: 'p_1', signature: 'sig' })).resolves.toMatchObject({
      verified: false,
      status: 'manual_required',
    });
  });

  it('accepts a valid Razorpay payment signature', async () => {
    process.env.RAZORPAY_KEY_SECRET = 'pay_secret';
    const gatewayOrderId = 'order_123';
    const gatewayPaymentId = 'pay_456';
    const signature = crypto.createHmac('sha256', 'pay_secret').update(`${gatewayOrderId}|${gatewayPaymentId}`).digest('hex');
    await expect(verifyGatewayPaymentSignature({ gatewayOrderId, gatewayPaymentId, signature })).resolves.toMatchObject({
      verified: true,
      status: 'verified',
    });
  });

  it('lifecycle stubs do not return fake success in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.PAYMENT_DEMO_MODE = 'false';
    await expect(recordPaymentAttempt({})).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' });
    await expect(markPaymentAuthorized({})).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' });
    await expect(markPaymentRefunded({})).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' });
  });

  it('payment route checks real verification before marking captured or advancing orders', () => {
    const source = fs.readFileSync('server/routers/paymentRouter.ts', 'utf8');
    const verificationGuard = source.indexOf('if (!verification.verified)');
    const capture = source.indexOf('await markPaymentCaptured');
    const advanceOrder = source.indexOf('await updateOrderStatus');
    expect(verificationGuard).toBeGreaterThan(-1);
    expect(capture).toBeGreaterThan(verificationGuard);
    expect(advanceOrder).toBeGreaterThan(capture);
  });

  it('contains no payment fake-success or payment stub strings in production payment paths', () => {
    const paths = ['server/services/paymentGateway.ts', 'server/connectors.ts', 'server/routers/paymentRouter.ts'];
    const joined = paths.map((path) => fs.readFileSync(path, 'utf8')).join('\n');
    expect(joined).not.toMatch(/fake\s+success/i);
    expect(joined).not.toMatch(/Payment STUB/i);
    expect(joined).not.toMatch(/stub_order_|stub_refund_/i);
  });
});
