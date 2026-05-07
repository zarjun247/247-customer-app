import { beforeEach, describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { readFileSync } from 'fs';
import {
  markPaymentAuthorized,
  markPaymentRefunded,
  recordPaymentAttempt,
  verifyGatewayPayment,
  verifyGatewayWebhookSignature,
} from './services/paymentGateway';
import { assertPaymentWebhookRoutePosture } from './_core/env';
import { paymentConnector } from './connectors';

function resetPaymentEnv() {
  delete process.env.PAYMENT_WEBHOOK_ENABLED;
  delete process.env.PAYMENT_WEBHOOK_ROUTE_IMPLEMENTED;
  delete process.env.RAZORPAY_WEBHOOK_SECRET;
  delete process.env.RAZORPAY_KEY_SECRET;
  delete process.env.RAZORPAY_KEY_ID;
  delete process.env.LOCAL_DEMO_MODE;
  delete process.env.PAYMENT_PROVIDER_MODE;
  process.env.NODE_ENV = 'test';
}

describe('payment gateway guards', () => {
  beforeEach(resetPaymentEnv);

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

  it('rejects missing webhook signature safely', () => {
    process.env.PAYMENT_WEBHOOK_ENABLED = 'true';
    process.env.RAZORPAY_WEBHOOK_SECRET = 's3cr3t';
    expect(verifyGatewayWebhookSignature('{"event":"payment.captured"}', undefined)).toBe(false);
  });

  it('fails closed when webhook enabled without implemented route marker', () => {
    process.env.PAYMENT_WEBHOOK_ENABLED = 'true';
    process.env.PAYMENT_WEBHOOK_ROUTE_IMPLEMENTED = 'false';
    const errors: string[] = [];
    assertPaymentWebhookRoutePosture(errors);
    expect(errors).toContain('PAYMENT_WEBHOOK_ENABLED_UNSUPPORTED_WITHOUT_VERIFIED_ROUTE');
  });

  it('returns false for malformed signature instead of throw', () => {
    process.env.PAYMENT_WEBHOOK_ENABLED = 'true';
    process.env.RAZORPAY_WEBHOOK_SECRET = 'abc';
    expect(() => verifyGatewayWebhookSignature('{}', 'not-hex')).not.toThrow();
    expect(verifyGatewayWebhookSignature('{}', 'not-hex')).toBe(false);
    expect(() => verifyGatewayWebhookSignature('{}', 'short')).not.toThrow();
    expect(verifyGatewayWebhookSignature('{}', 'short')).toBe(false);
  });

  it('payment verify fails when secret missing outside local/demo/test mode', async () => {
    process.env.RAZORPAY_KEY_SECRET = '';
    process.env.LOCAL_DEMO_MODE = 'false';
    process.env.NODE_ENV = 'production';
    await expect(paymentConnector.verifyPayment({ gatewayOrderId: 'o_1', gatewayPaymentId: 'p_1', signature: 'sig' })).rejects.toThrow(/provider_unconfigured/);
    await expect(verifyGatewayPayment({ gatewayOrderId: 'o_1', gatewayPaymentId: 'p_1', signature: 'sig' })).resolves.toMatchObject({
      verified: false,
      status: 'provider_unconfigured',
      realGatewayVerification: false,
    });
  });

  it('missing secret in explicit demo mode does not claim real payment success', async () => {
    process.env.NODE_ENV = 'production';
    process.env.PAYMENT_PROVIDER_MODE = 'demo';
    process.env.RAZORPAY_KEY_SECRET = '';
    await expect(verifyGatewayPayment({ gatewayOrderId: 'o_1', gatewayPaymentId: 'p_1', signature: 'sig' })).resolves.toMatchObject({
      verified: false,
      status: 'demo_skipped',
      realGatewayVerification: false,
    });
  });

  it('valid payment signature succeeds with real verification status', async () => {
    process.env.RAZORPAY_KEY_SECRET = 'pay_secret';
    const signature = crypto.createHmac('sha256', 'pay_secret').update('o_1|p_1').digest('hex');
    await expect(verifyGatewayPayment({ gatewayOrderId: 'o_1', gatewayPaymentId: 'p_1', signature })).resolves.toMatchObject({
      verified: true,
      status: 'verified',
      realGatewayVerification: true,
    });
  });

  it('lifecycle stubs do not return fake success in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.LOCAL_DEMO_MODE = 'false';
    await expect(recordPaymentAttempt({})).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' });
    await expect(markPaymentAuthorized({})).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' });
    await expect(markPaymentRefunded({})).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' });
  });

  it('does not leave fake payment success placeholders in production payment paths', () => {
    const gatewaySource = readFileSync('server/services/paymentGateway.ts', 'utf8');
    const connectorSource = readFileSync('server/connectors.ts', 'utf8');
    const paymentConnectorBlock = connectorSource.slice(
      connectorSource.indexOf('export const paymentConnector'),
      connectorSource.indexOf('// ─── Label Printer Connector'),
    );
    expect(gatewaySource).not.toMatch(/recordPaymentAttempt\([^)]*\).*return \{ ok: true \}/s);
    expect(gatewaySource).not.toMatch(/markPaymentAuthorized\([^)]*\).*return \{ ok: true \}/s);
    expect(gatewaySource).not.toMatch(/markPaymentRefunded\([^)]*\).*return \{ ok: true \}/s);
    expect(paymentConnectorBlock).not.toContain('Payment STUB');
    expect(paymentConnectorBlock).not.toContain('stub_order_');
    expect(paymentConnectorBlock).not.toContain('stub_refund_');
    expect(paymentConnectorBlock).not.toContain('status: "processed"');
  });
});
