import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrpcContext } from './_core/context';

const mocks = vi.hoisted(() => ({
  verifyGatewayPayment: vi.fn(),
  markPaymentCaptured: vi.fn(),
  markPaymentFailed: vi.fn(),
  getPaymentByGatewayOrder: vi.fn(),
  getPaymentByOrderId: vi.fn(),
  getOrderById: vi.fn(),
  updateOrderStatus: vi.fn(),
  getOrderItems: vi.fn(),
  createSlaEvent: vi.fn(),
  closeSlaEvent: vi.fn(),
  detectSlaBreaches: vi.fn(),
  getSlaBreachSummary: vi.fn(),
  getOpenSlaEvents: vi.fn(),
  getExpiryZones: vi.fn(),
  logAudit: vi.fn(),
  withIdempotency: vi.fn(),
}));

vi.mock('./services/paymentGateway', () => ({
  createGatewayOrder: vi.fn(),
  verifyGatewayPayment: mocks.verifyGatewayPayment,
  markPaymentCaptured: mocks.markPaymentCaptured,
  markPaymentFailed: mocks.markPaymentFailed,
  getPaymentByGatewayOrder: mocks.getPaymentByGatewayOrder,
}));

vi.mock('./payment', () => ({
  getPaymentByOrderId: mocks.getPaymentByOrderId,
  createSlaEvent: mocks.createSlaEvent,
  closeSlaEvent: mocks.closeSlaEvent,
  detectSlaBreaches: mocks.detectSlaBreaches,
  getSlaBreachSummary: mocks.getSlaBreachSummary,
  getOpenSlaEvents: mocks.getOpenSlaEvents,
  getExpiryZones: mocks.getExpiryZones,
}));

vi.mock('./db', () => ({
  getOrderById: mocks.getOrderById,
  updateOrderStatus: mocks.updateOrderStatus,
  getOrderItems: mocks.getOrderItems,
}));

vi.mock('./services/audit', () => ({ logAudit: mocks.logAudit }));

vi.mock('./services/idempotencyService', () => ({
  buildIdempotencyKey: (parts: string[]) => parts.join(':'),
  createMutationFingerprint: (input: unknown) => JSON.stringify(input),
  withIdempotency: mocks.withIdempotency,
}));

const { paymentRouter } = await import('./routers/paymentRouter');

function ctx(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: 'user-1',
      email: 'u@example.com',
      name: 'User',
      loginMethod: 'test',
      role: 'user',
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { headers: {}, protocol: 'https' } as TrpcContext['req'],
    res: {} as TrpcContext['res'],
  };
}

describe('payment router fail-closed verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withIdempotency.mockImplementation(async (_opts, operation) => operation());
  });

  it('does not mark payment/order successful when verification fails', async () => {
    mocks.verifyGatewayPayment.mockResolvedValue({
      verified: false,
      status: 'failed',
      realGatewayVerification: false,
      reason: 'gateway signature mismatch',
    });

    const caller = paymentRouter.createCaller(ctx());
    await expect(caller.verifyPayment({ gatewayOrderId: 'order_1', gatewayPaymentId: 'pay_1', signature: 'bad' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });

    expect(mocks.getPaymentByGatewayOrder).not.toHaveBeenCalled();
    expect(mocks.markPaymentCaptured).not.toHaveBeenCalled();
    expect(mocks.updateOrderStatus).not.toHaveBeenCalled();
    expect(mocks.createSlaEvent).not.toHaveBeenCalled();
  });
});
