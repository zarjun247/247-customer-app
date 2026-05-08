import { describe, expect, it } from "vitest";
import {
  InMemoryCommercialEventStore,
  appendCommercialEvent,
  appendCommercialEvents,
  createCommercialEvent,
  detectCommercialImpossibleStates,
  getCommercialLifecycleState,
  getCommercialTimeline,
  getCommercialTimelineByInvoice,
  getCommercialTimelineByOrder,
  getCommercialTimelineByPayment,
  normalizeCommercialStatus,
  reconcileCommercialAggregate,
  safeCommercialPayload,
  summarizeCommercialLifecycle,
} from "./services/commercialLifecycle";

describe("commercial lifecycle ledger foundation", () => {
  it("keeps event ledger append-only by rejecting duplicate event ids", async () => {
    const store = new InMemoryCommercialEventStore();
    const event = createCommercialEvent({ aggregateType: "order", aggregateId: "ord_uuid_1", eventType: "order_confirmed" });
    await store.insert(event);
    await expect(store.insert(event)).rejects.toThrow(/append-only/i);
  });

  it("does not create duplicate events for repeated idempotency keys", async () => {
    const store = new InMemoryCommercialEventStore();
    const first = await appendCommercialEvent(store, { aggregateType: "payment", aggregateId: "pay_uuid_1", paymentId: "pay_uuid_1", eventType: "payment_verified", idempotencyKey: "payment:pay_uuid_1:verified", eventPayload: { amountPaise: 1000 } });
    const second = await appendCommercialEvent(store, { aggregateType: "payment", aggregateId: "pay_uuid_1", paymentId: "pay_uuid_1", eventType: "payment_verified", idempotencyKey: "payment:pay_uuid_1:verified", eventPayload: { amountPaise: 1000 } });
    expect(second.eventId).toBe(first.eventId);
    expect(await getCommercialTimeline(store, { paymentId: "pay_uuid_1" })).toHaveLength(1);
  });

  it("derives pending payment and successful order lifecycle from events", () => {
    const pending = getCommercialLifecycleState([createCommercialEvent({ aggregateType: "checkout", aggregateId: "chk_1", eventType: "checkout_initiated" })]);
    expect(pending.state).toBe("initiated");

    const confirmed = getCommercialLifecycleState([
      createCommercialEvent({ aggregateType: "order", aggregateId: "ord_1", orderId: "ord_1", eventType: "payment_verified", eventPayload: { amountPaise: 2500 } }),
      createCommercialEvent({ aggregateType: "order", aggregateId: "ord_1", orderId: "ord_1", eventType: "order_confirmed" }),
      createCommercialEvent({ aggregateType: "order", aggregateId: "ord_1", orderId: "ord_1", invoiceId: "INV-001", eventType: "invoice_generated" }),
    ]);
    expect(confirmed.state).toBe("confirmed");
    expect(confirmed.invoiceState).toBe("confirmed");
  });

  it("derives partial and full refund lifecycle correctly", () => {
    const partial = getCommercialLifecycleState([
      createCommercialEvent({ aggregateType: "order", aggregateId: "ord_2", eventType: "payment_verified", eventPayload: { amountPaise: 10_000 } }),
      createCommercialEvent({ aggregateType: "order", aggregateId: "ord_2", eventType: "order_confirmed" }),
      createCommercialEvent({ aggregateType: "order", aggregateId: "ord_2", eventType: "refund_completed", eventPayload: { amountPaise: 4_000 } }),
    ]);
    expect(partial.state).toBe("partially_refunded");

    const full = getCommercialLifecycleState([
      createCommercialEvent({ aggregateType: "order", aggregateId: "ord_3", eventType: "payment_verified", eventPayload: { amountPaise: 10_000 } }),
      createCommercialEvent({ aggregateType: "order", aggregateId: "ord_3", eventType: "order_confirmed" }),
      createCommercialEvent({ aggregateType: "order", aggregateId: "ord_3", eventType: "refund_completed", eventPayload: { amountPaise: 6_000 } }),
      createCommercialEvent({ aggregateType: "order", aggregateId: "ord_3", eventType: "refund_completed", eventPayload: { amountPaise: 4_000 } }),
    ]);
    expect(full.state).toBe("refunded");
  });

  it("derives cancellation before payment and after reservation", () => {
    const beforePayment = getCommercialLifecycleState([
      createCommercialEvent({ aggregateType: "order", aggregateId: "ord_4", eventType: "checkout_initiated" }),
      createCommercialEvent({ aggregateType: "order", aggregateId: "ord_4", eventType: "cancellation_completed" }),
    ]);
    expect(beforePayment.state).toBe("cancelled");

    const afterReservation = getCommercialLifecycleState([
      createCommercialEvent({ aggregateType: "reservation", aggregateId: "res_1", reservationId: "res_1", eventType: "reservation_created" }),
      createCommercialEvent({ aggregateType: "reservation", aggregateId: "res_1", reservationId: "res_1", eventType: "reservation_released" }),
      createCommercialEvent({ aggregateType: "order", aggregateId: "ord_5", reservationId: "res_1", eventType: "cancellation_completed" }),
    ]);
    expect(afterReservation.reservationState).toBe("cancelled");
    expect(afterReservation.state).toBe("cancelled");
  });

  it("detects impossible states and reconciliation anomalies", async () => {
    const events = [
      createCommercialEvent({ aggregateType: "invoice", aggregateId: "INV-ORPHAN", invoiceId: "INV-ORPHAN", eventType: "invoice_generated" }),
      createCommercialEvent({ aggregateType: "refund", aggregateId: "rfnd_1", refundId: "rfnd_1", eventType: "refund_completed", eventPayload: { amountPaise: 5000, providerRefundId: "rfnd_provider_1" } }),
      createCommercialEvent({ aggregateType: "reservation", aggregateId: "res_2", reservationId: "res_2", eventType: "reservation_consumed" }),
      createCommercialEvent({ aggregateType: "payment", aggregateId: "pay_2", paymentId: "pay_2", eventType: "payment_verified", eventPayload: { amountPaise: 1000, gatewayPaymentId: "pay_provider_1" } }),
    ];
    const anomalies = detectCommercialImpossibleStates(events).map((a) => a.code);
    expect(anomalies).toContain("refund_exceeds_payment");
    expect(anomalies).toContain("invoice_without_successful_order");
    expect(anomalies).toContain("consumed_reservation_without_order_confirmation");
    expect(anomalies).toContain("payment_verified_without_sale_confirmation");

    const store = new InMemoryCommercialEventStore();
    for (const event of events) await store.insert(event);
    const reconciliation = await reconcileCommercialAggregate(store, {});
    expect(reconciliation.anomalies.length).toBeGreaterThanOrEqual(4);
  });

  it("orders timelines deterministically by occurredAt then eventId", async () => {
    const store = new InMemoryCommercialEventStore();
    await store.insert({ ...createCommercialEvent({ aggregateType: "order", aggregateId: "ord_time", eventType: "invoice_generated", occurredAt: "2026-01-01T00:00:00.000Z" }), eventId: "cevt_b" });
    await store.insert({ ...createCommercialEvent({ aggregateType: "order", aggregateId: "ord_time", eventType: "order_confirmed", occurredAt: "2025-01-01T00:00:00.000Z" }), eventId: "cevt_c" });
    await store.insert({ ...createCommercialEvent({ aggregateType: "order", aggregateId: "ord_time", eventType: "payment_verified", occurredAt: "2026-01-01T00:00:00.000Z" }), eventId: "cevt_a" });
    expect((await getCommercialTimeline(store, { aggregateId: "ord_time" })).map((event) => event.eventId)).toEqual(["cevt_c", "cevt_a", "cevt_b"]);
  });

  it("redacts secrets while preserving string-safe references", () => {
    const payload = safeCommercialPayload({ gatewayPaymentId: "pay_uuid_like_123", signature: "secret_sig", nested: { authToken: "secret_token" }, refundId: "rfnd_uuid_like_123" });
    expect(payload.gatewayPaymentId).toBe("pay_uuid_like_123");
    expect(payload.refundId).toBe("rfnd_uuid_like_123");
    expect(payload.signature).toBe("[REDACTED]");
    expect((payload.nested as any).authToken).toBe("[REDACTED]");
  });

  it("controls duplicate invoice, payment, and refund references through idempotent append and anomaly visibility", async () => {
    const store = new InMemoryCommercialEventStore();
    await appendCommercialEvents(store, [
      { aggregateType: "invoice", aggregateId: "INV-777", invoiceId: "INV-777", eventType: "invoice_generated", idempotencyKey: "invoice:INV-777" },
      { aggregateType: "invoice", aggregateId: "INV-777", invoiceId: "INV-777", eventType: "invoice_generated", idempotencyKey: "invoice:INV-777" },
      { aggregateType: "payment", aggregateId: "pay_777", paymentId: "pay_777", eventType: "payment_verified", idempotencyKey: "payment:pay_777:verified", eventPayload: { gatewayPaymentId: "pay_ref_777", amountPaise: 777 } },
      { aggregateType: "refund", aggregateId: "rfnd_777", refundId: "rfnd_777", eventType: "refund_completed", idempotencyKey: "refund:rfnd_777:completed", eventPayload: { providerRefundId: "rfnd_ref_777", amountPaise: 100 } },
    ]);
    expect(await getCommercialTimelineByInvoice(store, "INV-777")).toHaveLength(1);
    expect(await getCommercialTimelineByPayment(store, "pay_777")).toHaveLength(1);
    const summary = summarizeCommercialLifecycle(await getCommercialTimeline(store, {}));
    expect(summary.providerRefs).toEqual(expect.arrayContaining(["pay_ref_777", "rfnd_ref_777"]));
    expect(summary.anomalies.map((a) => a.code)).toContain("invoice_without_successful_order");
  });

  it("does not mutate stock through event append paths", async () => {
    const store = new InMemoryCommercialEventStore();
    const stock = { qtyOnHand: 5, qtyReserved: 1 };
    await appendCommercialEvent(store, { aggregateType: "reservation", aggregateId: "res_stock", reservationId: "res_stock", eventType: "reservation_created", eventPayload: { qtyReserved: 1, stockSnapshot: { ...stock } } });
    expect(stock).toEqual({ qtyOnHand: 5, qtyReserved: 1 });
  });

  it("maps existing runtime statuses into normalized commercial states", () => {
    expect(normalizeCommercialStatus("reservation", "active")).toBe("authorized");
    expect(normalizeCommercialStatus("payment", "paid")).toBe("confirmed");
    expect(normalizeCommercialStatus("sale_order", "cancelled")).toBe("cancelled");
    expect(normalizeCommercialStatus("refund", "success")).toBe("confirmed");
  });

  it("supports timeline read helpers by order, payment, and invoice", async () => {
    const store = new InMemoryCommercialEventStore();
    await appendCommercialEvent(store, { aggregateType: "order", aggregateId: "ord_read", orderId: "ord_read", paymentId: "pay_read", invoiceId: "INV-READ", eventType: "payment_verified", eventPayload: { amountPaise: 999 } });
    expect(await getCommercialTimelineByOrder(store, "ord_read")).toHaveLength(1);
    expect(await getCommercialTimelineByPayment(store, "pay_read")).toHaveLength(1);
    expect(await getCommercialTimelineByInvoice(store, "INV-READ")).toHaveLength(1);
  });
});
