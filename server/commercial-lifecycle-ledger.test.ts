import { describe, expect, it } from "vitest";
import {
  appendCommercialEvent,
  appendCommercialEvents,
  assertCommercialLedgerAppendOnlyOperation,
  createInMemoryCommercialEventStore,
  detectCommercialImpossibleStates,
  getAggregateLifecycle,
  getCommercialLifecycleState,
  getCommercialTimeline,
  getCommercialTimelineByInvoice,
  getCommercialTimelineByOrder,
  getCommercialTimelineByPayment,
  mapCommercialStatus,
  reconcileCommercialAggregate,
  serializeCommercialPayload,
  summarizeCommercialLifecycle,
} from "./services/commercialLifecycle";

describe("commercial lifecycle event ledger foundation", () => {
  it("keeps the event ledger append-only", () => {
    expect(assertCommercialLedgerAppendOnlyOperation("append")).toBe(true);
    expect(() => assertCommercialLedgerAppendOnlyOperation("update")).toThrow(
      "append-only"
    );
    expect(() => assertCommercialLedgerAppendOnlyOperation("delete")).toThrow(
      "append-only"
    );
  });

  it("suppresses duplicate idempotency keys without creating duplicate lifecycle truth", async () => {
    const store = createInMemoryCommercialEventStore();
    await appendCommercialEvent(
      {
        aggregateType: "payment",
        aggregateId: "pay-1",
        eventType: "payment_verified",
        idempotencyKey: "payment:pay-1:verified",
        eventPayload: { amountPaise: 1000 },
      },
      store
    );
    const duplicate = await appendCommercialEvent(
      {
        aggregateType: "payment",
        aggregateId: "pay-1",
        eventType: "payment_verified",
        idempotencyKey: "payment:pay-1:verified",
        eventPayload: { amountPaise: 1000 },
      },
      store
    );

    expect(duplicate.duplicate).toBe(true);
    expect(store.events).toHaveLength(1);
  });

  it("derives pending payment and successful order states from event streams", async () => {
    const store = createInMemoryCommercialEventStore();
    await appendCommercialEvent(
      {
        aggregateType: "order",
        aggregateId: "ord-1",
        orderId: "ord-1",
        eventType: "reservation_created",
      },
      store
    );
    expect(
      (await getAggregateLifecycle({ orderId: "ord-1" }, store)).state
    ).toBe("pending");

    await appendCommercialEvent(
      {
        aggregateType: "order",
        aggregateId: "ord-1",
        orderId: "ord-1",
        eventType: "payment_verified",
        eventPayload: { amountPaise: 5000 },
      },
      store
    );
    await appendCommercialEvent(
      {
        aggregateType: "order",
        aggregateId: "ord-1",
        orderId: "ord-1",
        eventType: "order_confirmed",
      },
      store
    );
    expect(
      (await getAggregateLifecycle({ orderId: "ord-1" }, store)).state
    ).toBe("confirmed");
  });

  it("derives partial refund, full refund, and invoice-with-refund-pending states", async () => {
    const partial = createInMemoryCommercialEventStore([
      {
        aggregateType: "order",
        aggregateId: "ord-ref",
        orderId: "ord-ref",
        eventType: "payment_verified",
        eventPayload: { amountPaise: 10000 },
      },
      {
        aggregateType: "order",
        aggregateId: "ord-ref",
        orderId: "ord-ref",
        eventType: "order_confirmed",
      },
      {
        aggregateType: "invoice",
        aggregateId: "INV-1",
        orderId: "ord-ref",
        invoiceId: "INV-1",
        eventType: "invoice_generated",
      },
      {
        aggregateType: "refund",
        aggregateId: "r-1",
        orderId: "ord-ref",
        refundId: "r-1",
        eventType: "refund_initiated",
        eventPayload: { amountPaise: 2000 },
      },
      {
        aggregateType: "refund",
        aggregateId: "r-1",
        orderId: "ord-ref",
        refundId: "r-1",
        eventType: "refund_completed",
        eventPayload: { amountPaise: 2000 },
      },
    ]);
    expect(
      (await getAggregateLifecycle({ orderId: "ord-ref" }, partial)).state
    ).toBe("partially_refunded");

    await appendCommercialEvent(
      {
        aggregateType: "refund",
        aggregateId: "r-2",
        orderId: "ord-ref",
        refundId: "r-2",
        eventType: "refund_completed",
        eventPayload: { amountPaise: 8000 },
      },
      partial
    );
    expect(
      (await getAggregateLifecycle({ orderId: "ord-ref" }, partial)).state
    ).toBe("refunded");

    const pendingRefund = createInMemoryCommercialEventStore([
      {
        aggregateType: "order",
        aggregateId: "ord-pending-ref",
        orderId: "ord-pending-ref",
        eventType: "payment_verified",
        eventPayload: { amountPaise: 10000 },
      },
      {
        aggregateType: "order",
        aggregateId: "ord-pending-ref",
        orderId: "ord-pending-ref",
        eventType: "order_confirmed",
      },
      {
        aggregateType: "invoice",
        aggregateId: "INV-P",
        orderId: "ord-pending-ref",
        invoiceId: "INV-P",
        eventType: "invoice_generated",
      },
      {
        aggregateType: "refund",
        aggregateId: "r-p",
        orderId: "ord-pending-ref",
        refundId: "r-p",
        eventType: "refund_initiated",
        eventPayload: { amountPaise: 1000 },
      },
    ]);
    expect(
      (
        await getAggregateLifecycle(
          { orderId: "ord-pending-ref" },
          pendingRefund
        )
      ).state
    ).toBe("confirmed");
  });

  it("derives cancellation before payment and after reservation", () => {
    expect(
      getCommercialLifecycleState(
        createInMemoryCommercialEventStore([
          {
            aggregateType: "order",
            aggregateId: "ord-cancel",
            eventType: "checkout_initiated",
          },
          {
            aggregateType: "order",
            aggregateId: "ord-cancel",
            eventType: "cancellation_completed",
          },
        ]).events
      )
    ).toBe("cancelled");
    expect(
      getCommercialLifecycleState(
        createInMemoryCommercialEventStore([
          {
            aggregateType: "reservation",
            aggregateId: "res-cancel",
            eventType: "reservation_created",
          },
          {
            aggregateType: "reservation",
            aggregateId: "res-cancel",
            eventType: "reservation_released",
          },
          {
            aggregateType: "order",
            aggregateId: "ord-cancel-2",
            eventType: "cancellation_completed",
          },
        ]).events
      )
    ).toBe("cancelled");
  });

  it("detects impossible states and reconciliation anomalies read-only", () => {
    const events = createInMemoryCommercialEventStore([
      {
        aggregateType: "payment",
        aggregateId: "pay-orphan",
        eventType: "payment_verified",
        eventPayload: { amountPaise: 1000, gatewayPaymentId: "gw-dup" },
      },
      {
        aggregateType: "refund",
        aggregateId: "refund-too-large",
        eventType: "refund_completed",
        eventPayload: { amountPaise: 1500, providerRefundId: "refund-dup" },
      },
      {
        aggregateType: "refund",
        aggregateId: "refund-too-large-2",
        eventType: "refund_completed",
        eventPayload: { amountPaise: 1, providerRefundId: "refund-dup" },
      },
      {
        aggregateType: "invoice",
        aggregateId: "INV-ORPHAN",
        eventType: "invoice_generated",
        eventPayload: { invoiceNumber: "INV-DUP" },
      },
      {
        aggregateType: "invoice",
        aggregateId: "INV-ORPHAN-2",
        eventType: "invoice_generated",
        eventPayload: { invoiceNumber: "INV-DUP" },
      },
      {
        aggregateType: "reservation",
        aggregateId: "res-consumed",
        eventType: "reservation_consumed",
      },
    ]).events;

    const codes = detectCommercialImpossibleStates(events).map(
      anomaly => anomaly.code
    );
    expect(codes).toContain("refund_exceeds_payment");
    expect(codes).toContain("invoice_without_successful_order");
    expect(codes).toContain("consumed_reservation_without_order");
    expect(codes).toContain("payment_verified_without_sale_confirmation");
    expect(codes).toContain("duplicate_invoice_ref");
    expect(codes).toContain("duplicate_provider_ref");
    expect(summarizeCommercialLifecycle(events).hasCriticalAnomaly).toBe(true);
  });

  it("orders timelines deterministically by occurredAt then eventId", async () => {
    const store = createInMemoryCommercialEventStore();
    await appendCommercialEvents(
      [
        {
          eventId: "b-event",
          aggregateType: "order",
          aggregateId: "ord-time",
          orderId: "ord-time",
          eventType: "order_confirmed",
          occurredAt: "2026-01-01T00:00:00.000Z",
        },
        {
          eventId: "a-event",
          aggregateType: "order",
          aggregateId: "ord-time",
          orderId: "ord-time",
          eventType: "payment_verified",
          occurredAt: "2026-01-01T00:00:00.000Z",
        },
        {
          eventId: "c-event",
          aggregateType: "order",
          aggregateId: "ord-time",
          orderId: "ord-time",
          eventType: "invoice_generated",
          occurredAt: "2026-01-01T00:00:01.000Z",
        },
      ],
      store
    );
    expect(
      (await getCommercialTimeline({ orderId: "ord-time" }, store)).map(
        event => event.eventId
      )
    ).toEqual(["a-event", "b-event", "c-event"]);
  });

  it("redacts sensitive payload fields while preserving string-safe refs", async () => {
    const payload = serializeCommercialPayload({
      gatewaySignature: "sig",
      nested: { apiToken: "token" },
      providerPaymentId: "pay_UUID_001",
      invoiceNumber: "INV-000000000000000001",
    });
    expect(payload.gatewaySignature).toBe("[REDACTED]");
    expect((payload.nested as Record<string, unknown>).apiToken).toBe(
      "[REDACTED]"
    );
    expect(payload.providerPaymentId).toBe("pay_UUID_001");
    expect(payload.invoiceNumber).toBe("INV-000000000000000001");

    const store = createInMemoryCommercialEventStore();
    await appendCommercialEvent(
      {
        aggregateType: "payment",
        aggregateId: "pay_UUID_001",
        paymentId: "pay_UUID_001",
        eventType: "payment_verified",
        eventPayload: payload,
      },
      store
    );
    expect(store.events[0].paymentId).toBe("pay_UUID_001");
  });

  it("controls duplicate invoice/payment/refund events and surfaces duplicate attempts", async () => {
    const store = createInMemoryCommercialEventStore();
    await appendCommercialEvent(
      {
        aggregateType: "invoice",
        aggregateId: "INV-1",
        invoiceId: "INV-1",
        eventType: "invoice_generated",
        idempotencyKey: "invoice:INV-1",
        eventPayload: { invoiceNumber: "INV-1" },
      },
      store
    );
    await appendCommercialEvent(
      {
        aggregateType: "invoice",
        aggregateId: "INV-1",
        invoiceId: "INV-1",
        eventType: "invoice_generated",
        idempotencyKey: "invoice:INV-1",
        eventPayload: { invoiceNumber: "INV-1" },
      },
      store
    );
    await appendCommercialEvent(
      {
        aggregateType: "payment",
        aggregateId: "pay-1",
        paymentId: "pay-1",
        eventType: "payment_verified",
        idempotencyKey: "payment:pay-1",
        eventPayload: { amountPaise: 100, gatewayPaymentId: "pay-1" },
      },
      store
    );
    await appendCommercialEvent(
      {
        aggregateType: "refund",
        aggregateId: "ref-1",
        refundId: "ref-1",
        paymentId: "pay-1",
        eventType: "refund_completed",
        idempotencyKey: "refund:ref-1",
        eventPayload: { amountPaise: 100, providerRefundId: "ref-1" },
      },
      store
    );

    expect(store.events).toHaveLength(3);
    const duplicateSummary = summarizeCommercialLifecycle([
      { ...store.events[0], duplicate: true },
    ]);
    expect(duplicateSummary.anomalies.map(a => a.code)).toContain(
      "duplicate_event_attempt"
    );
  });

  it("provides order/payment/invoice read helpers for reconciliation visibility", async () => {
    const store = createInMemoryCommercialEventStore([
      {
        aggregateType: "order",
        aggregateId: "ord-read",
        orderId: "ord-read",
        paymentId: "pay-read",
        invoiceId: "INV-READ",
        eventType: "payment_verified",
        eventPayload: { amountPaise: 1000 },
      },
      {
        aggregateType: "order",
        aggregateId: "ord-read",
        orderId: "ord-read",
        paymentId: "pay-read",
        invoiceId: "INV-READ",
        eventType: "order_confirmed",
      },
      {
        aggregateType: "invoice",
        aggregateId: "INV-READ",
        orderId: "ord-read",
        paymentId: "pay-read",
        invoiceId: "INV-READ",
        eventType: "invoice_generated",
      },
    ]);
    expect(await getCommercialTimelineByOrder("ord-read", store)).toHaveLength(
      3
    );
    expect(
      await getCommercialTimelineByPayment("pay-read", store)
    ).toHaveLength(3);
    expect(
      await getCommercialTimelineByInvoice("INV-READ", store)
    ).toHaveLength(3);
    expect(
      (await reconcileCommercialAggregate({ orderId: "ord-read" }, store)).state
    ).toBe("confirmed");
  });

  it("does not mutate stock through event append paths", async () => {
    const stock = { qtyOnHand: 10, qtyReserved: 0 };
    const before = { ...stock };
    const store = createInMemoryCommercialEventStore();
    await appendCommercialEvent(
      {
        aggregateType: "reservation",
        aggregateId: "res-stock",
        eventType: "reservation_created",
        eventPayload: { qty: 2, stock },
      },
      store
    );
    expect(stock).toEqual(before);
  });

  it("normalizes existing runtime statuses additively", () => {
    expect(mapCommercialStatus("payment", "paid")).toBe("confirmed");
    expect(mapCommercialStatus("reservation", "active")).toBe("authorized");
    expect(mapCommercialStatus("sale_order", "draft")).toBe("initiated");
  });
});
