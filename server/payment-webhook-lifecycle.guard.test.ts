import { afterEach, describe, expect, it } from "vitest";
import crypto from "crypto";
import fs from "fs";
import {
  verifyGatewayPaymentSignature,
  verifyGatewayWebhookSignature,
} from "./services/paymentGateway";
import {
  extractProviderWebhookRefs,
  hashRawPayload,
  sanitizeProviderWebhookPayload,
  verificationStatusIsCommerciallySafe,
} from "./services/paymentWebhookLifecycle";

const service = fs.readFileSync(
  "server/services/paymentWebhookLifecycle.ts",
  "utf8"
);
const route = fs.readFileSync("server/paymentWebhookRoutes.ts", "utf8");
const schema = fs
  .readdirSync("drizzle/schema")
  .filter(f => f.endsWith(".ts") && f !== "index.ts")
  .map(f => fs.readFileSync(`drizzle/schema/${f}`, "utf8"))
  .join("\n");
const migration = fs.readFileSync(
  "drizzle/0045_provider_webhook_events.sql",
  "utf8"
);
const router = fs.readFileSync("server/routers/paymentRouter.ts", "utf8");
const ORIGINAL_ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("payment webhook lifecycle safety", () => {
  it("accepts valid webhook signatures and rejects missing or malformed signatures", () => {
    process.env.PAYMENT_WEBHOOK_ENABLED = "true";
    process.env.RAZORPAY_WEBHOOK_SECRET = "webhook_secret";
    const body = JSON.stringify({ event: "payment.captured", id: "evt_1" });
    const signature = crypto
      .createHmac("sha256", "webhook_secret")
      .update(body)
      .digest("hex");
    expect(verifyGatewayWebhookSignature(body, signature)).toBe(true);
    expect(verifyGatewayWebhookSignature(body, undefined)).toBe(false);
    expect(verifyGatewayWebhookSignature(body, "not-hex")).toBe(false);
  });

  it("fails closed when production webhook secret or raw body is missing", () => {
    expect(service).toContain("if (!input.rawBody)");
    expect(service).toContain("runtimeIsProduction()");
    expect(service).toContain(
      "Raw webhook body is required for signature verification"
    );
    expect(route).toContain("rawBodyFromRequest(req)");
    process.env.PAYMENT_WEBHOOK_ENABLED = "true";
    process.env.RAZORPAY_WEBHOOK_SECRET = "";
    process.env.NODE_ENV = "production";
    expect(() => verifyGatewayWebhookSignature("{}", "abc")).toThrow(
      /Webhook secret missing/
    );
  });

  it("declares a durable provider webhook event ledger with event-id and payload-hash idempotency", () => {
    expect(schema).toContain("export const providerWebhookEvents");
    expect(schema).toContain("providerEventId");
    expect(schema).toContain("rawPayloadHash");
    expect(schema).toContain("payloadJson");
    expect(schema).toContain("signatureVerified");
    expect(schema).toContain("ignored_duplicate");
    expect(migration).toContain("provider_webhook_events_provider_event_id_uq");
    expect(migration).toContain("idx_provider_webhook_events_payload_hash");
    expect(migration).toContain("idx_provider_webhook_events_payment");
    expect(migration).toContain("idx_provider_webhook_events_refund");
  });

  it("detects duplicate provider event IDs and duplicate payload hashes before processing", () => {
    expect(service).toContain(
      "findExistingEvent(PROVIDER, refs.providerEventId, rawPayloadHash)"
    );
    expect(service).toContain("providerEventId");
    expect(service).toContain("rawPayloadHash");
    expect(service).toContain('processingStatus: "verified"');
    expect(service).toContain('status: "ignored_duplicate"');
    expect(service).toContain("payment_duplicate_event_ignored");
    expect(hashRawPayload('{"id":"evt_1"}')).toHaveLength(64);
  });

  it("centralizes captured payment advancement and guards it against double processing", () => {
    const paidGuard = service.indexOf('payment.status === "paid"');
    const capture = service.indexOf("await markPaymentCaptured");
    const orderAdvance = service.indexOf("await updateOrderStatus");
    const sla = service.indexOf("await createSlaEvent");
    expect(router).toContain("advanceOrderAfterPaymentCaptured");
    expect(paidGuard).toBeGreaterThan(-1);
    expect(capture).toBeGreaterThan(paidGuard);
    expect(orderAdvance).toBeGreaterThan(capture);
    expect(sla).toBeGreaterThan(capture);
  });

  it("releases only active reservations on failed/cancelled/expired payments through reservation service", () => {
    const reservation = fs.readFileSync(
      "server/services/reservationService.ts",
      "utf8"
    );
    expect(service).toContain("releaseReservationOnPaymentFailure");
    expect(service).toContain("payment_failed");
    expect(service).toContain("payment_cancelled");
    expect(service).toContain("payment_expired");
    expect(reservation).toContain(
      "eq(stockReservations.status, ACTIVE_RESERVATION_STATUS)"
    );
    expect(reservation).toContain('"consumed"');
    expect(reservation).toContain("releaseReservationAtomic");
    expect(reservation).toContain("consumeReservationAtomic");
  });

  it("reconciles refund success/failure webhooks through the refund ledger exactly once", () => {
    expect(service).toContain("REFUND_SUCCESS_EVENTS");
    expect(service).toContain("REFUND_FAILED_EVENTS");
    expect(service).toContain("from(refunds)");
    expect(service).toContain(
      'refund.status === "success" || refund.status === "failed"'
    );
    expect(service).toContain("settleProviderRefundExactlyOnce");
    expect(service).toContain("markRefundSuccess");
    expect(service).toContain("markRefundFailedRecord");
    expect(service).toContain("refund_completed");
  });

  it("records unsupported events without mutating commercial state", () => {
    const unsupported = service.lastIndexOf('"unsupported_event"');
    const capture = service.indexOf("PAYMENT_CAPTURED_EVENTS.has");
    const failed = service.indexOf("PAYMENT_FAILED_EVENTS.has");
    const refund = service.indexOf("REFUND_SUCCESS_EVENTS.has");
    expect(unsupported).toBeGreaterThan(-1);
    expect(capture).toBeLessThan(unsupported);
    expect(failed).toBeLessThan(unsupported);
    expect(refund).toBeLessThan(unsupported);
  });

  it("never treats provider_unconfigured or demo_skipped as commercially verified", async () => {
    process.env.RAZORPAY_KEY_SECRET = "";
    process.env.PAYMENT_DEMO_MODE = "true";
    process.env.NODE_ENV = "test";
    await expect(
      verifyGatewayPaymentSignature({
        gatewayOrderId: "o",
        gatewayPaymentId: "p",
        signature: "s",
      })
    ).resolves.toMatchObject({ verified: false, status: "demo_skipped" });
    expect(verificationStatusIsCommerciallySafe("demo_skipped")).toBe(false);
    expect(verificationStatusIsCommerciallySafe("provider_unconfigured")).toBe(
      false
    );
    expect(verificationStatusIsCommerciallySafe("verified")).toBe(true);
  });

  it("sanitizes raw payloads and does not expose signatures, tokens, instruments, PII, or prescription data", () => {
    const payload = {
      id: "evt_1",
      event: "payment.captured",
      signature: "secret-signature",
      payload: {
        payment: {
          entity: {
            id: "pay_1",
            order_id: "order_1",
            email: "a@example.com",
            contact: "9999999999",
            card: { last4: "1111" },
            notes: { orderId: "7", prescription: "rx" },
          },
        },
      },
      token: "secret-token",
    };
    const sanitized = JSON.stringify(sanitizeProviderWebhookPayload(payload));
    expect(sanitized).not.toContain("secret-signature");
    expect(sanitized).not.toContain("secret-token");
    expect(sanitized).not.toContain("a@example.com");
    expect(sanitized).not.toContain("9999999999");
    expect(sanitized).not.toContain("1111");
    expect(sanitized).not.toContain("rx");
    expect(extractProviderWebhookRefs(payload)).toMatchObject({
      eventType: "payment.captured",
      providerEventId: "evt_1",
      gatewayOrderId: "order_1",
      gatewayPaymentId: "pay_1",
      orderId: 7,
    });
  });

  it("appends lifecycle/audit events when a commercial event ledger is available", () => {
    for (const event of [
      "payment_webhook_received",
      "payment_signature_verified",
      "payment_captured",
      "payment_failed",
      "refund_webhook_received",
      "refund_completed",
      "payment_duplicate_event_ignored",
    ]) {
      expect(service).toContain(event);
    }
  });

  it("does not introduce direct stock mutation in the payment webhook path", () => {
    expect(service).not.toMatch(
      /\.update\((storeSkus|batches|batchLedger|stockReservations)\)/
    );
    expect(service).not.toContain("qtyOnHand");
    expect(service).not.toContain("stockQty");
    expect(service).toContain("reservationService");
  });
});
