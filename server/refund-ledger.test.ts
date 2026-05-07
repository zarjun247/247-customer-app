import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";
import { calculateRefundAvailability } from "./services/refundService";

describe("refund ledger amount safety", () => {
  it("allows partial and multiple refunds up to the paid amount", () => {
    const partial = calculateRefundAvailability({
      paidPaise: 10_000,
      amountPaise: 4_000,
      existingRefunds: [],
    });
    expect(partial).toEqual({ paidPaise: 10_000, alreadyRefundedPaise: 0, availablePaise: 10_000 });

    const second = calculateRefundAvailability({
      paidPaise: 10_000,
      amountPaise: 6_000,
      existingRefunds: [{ amountPaise: 4_000, status: "success" }],
    });
    expect(second).toEqual({ paidPaise: 10_000, alreadyRefundedPaise: 4_000, availablePaise: 6_000 });
  });

  it("blocks over-refunds", () => {
    expect(() => calculateRefundAvailability({
      paidPaise: 10_000,
      amountPaise: 1_001,
      existingRefunds: [{ amountPaise: 9_000, status: "success" }],
    })).toThrow(TRPCError);
  });

  it("counts pending refunds toward consumed refundable amount", () => {
    const availability = calculateRefundAvailability({
      paidPaise: 10_000,
      amountPaise: 2_000,
      existingRefunds: [
        { amountPaise: 4_000, status: "success" },
        { amountPaise: 4_000, status: "pending" },
      ],
    });
    expect(availability).toEqual({ paidPaise: 10_000, alreadyRefundedPaise: 8_000, availablePaise: 2_000 });
  });

  it("does not count failed or cancelled refunds as consumed amount", () => {
    const availability = calculateRefundAvailability({
      paidPaise: 10_000,
      amountPaise: 10_000,
      existingRefunds: [
        { amountPaise: 4_000, status: "failed" },
        { amountPaise: 4_000, status: "cancelled" },
      ],
    });
    expect(availability).toEqual({ paidPaise: 10_000, alreadyRefundedPaise: 0, availablePaise: 10_000 });
  });
});
