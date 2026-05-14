import { TRPCError } from "@trpc/server";

export type RefundProviderState =
  | "pending_provider"
  | "provider_not_configured"
  | "manual_required"
  | "succeeded"
  | "failed";
export type RefundLedgerStatus = "pending" | "success" | "failed" | "cancelled";

export const REFUND_CONSUMING_STATUSES: RefundLedgerStatus[] = [
  "pending",
  "success",
];

export function normalizeAmountPaise(amountPaise: number) {
  if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Refund amount must be a positive paise integer",
    });
  }
  return amountPaise;
}

export function calculateRefundAvailability(input: {
  paidPaise: number;
  amountPaise?: number;
  existingRefunds: Array<{
    amountPaise: number | string | null;
    status: string;
  }>;
}) {
  const paidPaise = Number(input.paidPaise ?? 0);
  const consumedPaise = input.existingRefunds
    .filter(refund =>
      REFUND_CONSUMING_STATUSES.includes(refund.status as RefundLedgerStatus)
    )
    .reduce((total, refund) => total + Number(refund.amountPaise ?? 0), 0);
  const availablePaise = Math.max(0, paidPaise - consumedPaise);
  if (
    input.amountPaise !== undefined &&
    normalizeAmountPaise(input.amountPaise) > availablePaise
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Refund exceeds available paid amount",
    });
  }
  return { availablePaise, paidPaise, alreadyRefundedPaise: consumedPaise };
}

export function resolveRefundLedgerStatus(
  providerState: RefundProviderState
): RefundLedgerStatus {
  if (providerState === "failed" || providerState === "manual_required")
    return "failed";
  if (providerState === "succeeded") return "success";
  return "pending";
}
