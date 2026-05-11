import { describe, it, expect, vi } from "vitest";
import { appendCommercialEventWithDb, normalizeCommercialEvent } from "./commercialLifecycle";

describe("appendCommercialEventWithDb transactional behavior", () => {
  it("uses provided DB/tx for inserts when idempotencyKey absent", async () => {
    const fakeTx: any = {
      insert: vi.fn().mockImplementation(() => ({ values: async () => ({ insertId: 42 }) })),
    };
    const input = {
      aggregateType: "payment",
      aggregateId: "X1",
      eventType: "payment_verified",
      actorType: "provider",
      eventPayload: { amountPaise: 1000 },
    } as any;

    const result = await appendCommercialEventWithDb(fakeTx, input);
    expect(fakeTx.insert).toHaveBeenCalled();
    expect(result.eventType).toBe("payment_verified");
  });

  it("respects idempotencyKey by checking existing before insert when provided", async () => {
    const existingRow = { eventId: "e1", idempotencyKey: "k1", eventPayload: "{}" };
    const fakeTx: any = {
      select: vi.fn().mockReturnValue({ from: () => ({ where: () => ({ limit: async () => [existingRow] }) }) }),
      insert: vi.fn().mockImplementation((table: any) => ({ values: async (_: any) => ({ insertId: 1 }) })),
    };
    const input = {
      aggregateType: "refund",
      aggregateId: "R1",
      eventType: "refund_completed",
      actorType: "provider",
      eventPayload: { amountPaise: 1000 },
      idempotencyKey: "k1",
    } as any;

    const result = await appendCommercialEventWithDb(fakeTx, input);
    expect(fakeTx.select).toHaveBeenCalled();
    expect(fakeTx.insert).not.toHaveBeenCalled();
    expect(result.eventId).toBe(existingRow.eventId);
  });
});
