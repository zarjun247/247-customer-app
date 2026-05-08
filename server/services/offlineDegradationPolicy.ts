import { TRPCError } from "@trpc/server";

export type OfflineRuntimeMode = "online" | "degraded_provider" | "degraded_network" | "offline" | "recovery";

export type OfflineOperationCategory =
  | "draft_intent"
  | "reconcile_intent"
  | "never_finalize_offline";

export type OfflineOperationType =
  | "customer_order_draft"
  | "cart_draft"
  | "prescription_upload_metadata_placeholder"
  | "support_ticket_draft"
  | "supplier_invoice_draft"
  | "stock_audit_count_draft"
  | "delivery_note_draft"
  | "non_regulated_otc_sale_draft"
  | "staff_note"
  | "cold_chain_manual_temperature_reading"
  | "sop_acknowledgement"
  | "payment_verification"
  | "regulated_h_release"
  | "regulated_h1_release"
  | "regulated_x_release"
  | "prescription_approval"
  | "stock_physical_decrement"
  | "stock_inward_commit"
  | "refund_completion"
  | "credit_note_issuance"
  | "invoice_finalization"
  | "controlled_drug_release"
  | "provider_sync_success"
  | "h1_final_register_row";

export type OfflineOperationPolicy = {
  operationType: OfflineOperationType | string;
  category: OfflineOperationCategory;
  allowedOffline: boolean;
  requiresIdempotencyKey: boolean;
  replayRequiresOnlineValidation: boolean;
  highRisk: boolean;
  reason: string;
};

const draftIntentOperations = new Set<OfflineOperationType>([
  "customer_order_draft",
  "cart_draft",
  "prescription_upload_metadata_placeholder",
  "support_ticket_draft",
  "supplier_invoice_draft",
  "stock_audit_count_draft",
  "delivery_note_draft",
]);

const reconcileIntentOperations = new Set<OfflineOperationType>([
  "non_regulated_otc_sale_draft",
  "staff_note",
  "cold_chain_manual_temperature_reading",
  "sop_acknowledgement",
]);

const neverFinalizeOfflineOperations = new Set<OfflineOperationType>([
  "payment_verification",
  "regulated_h_release",
  "regulated_h1_release",
  "regulated_x_release",
  "prescription_approval",
  "stock_physical_decrement",
  "stock_inward_commit",
  "refund_completion",
  "credit_note_issuance",
  "invoice_finalization",
  "controlled_drug_release",
  "provider_sync_success",
  "h1_final_register_row",
]);

export const allowedOfflineDraftOperations = Array.from(draftIntentOperations) as OfflineOperationType[];
export const allowedOfflineReconcileOperations = Array.from(reconcileIntentOperations) as OfflineOperationType[];
export const blockedOfflineOperations = Array.from(neverFinalizeOfflineOperations) as OfflineOperationType[];

export function getOfflineOperationPolicy(operationType: OfflineOperationType | string): OfflineOperationPolicy {
  if (draftIntentOperations.has(operationType as OfflineOperationType)) {
    return {
      operationType,
      category: "draft_intent",
      allowedOffline: true,
      requiresIdempotencyKey: true,
      replayRequiresOnlineValidation: true,
      highRisk: false,
      reason: "May be captured offline only as non-final draft/intent pending online sync.",
    };
  }

  if (reconcileIntentOperations.has(operationType as OfflineOperationType)) {
    return {
      operationType,
      category: "reconcile_intent",
      allowedOffline: true,
      requiresIdempotencyKey: true,
      replayRequiresOnlineValidation: true,
      highRisk: operationType === "non_regulated_otc_sale_draft",
      reason: "May be captured offline with strict idempotency and later online reconciliation.",
    };
  }

  if (neverFinalizeOfflineOperations.has(operationType as OfflineOperationType)) {
    return {
      operationType,
      category: "never_finalize_offline",
      allowedOffline: false,
      requiresIdempotencyKey: true,
      replayRequiresOnlineValidation: true,
      highRisk: true,
      reason: "Must fail closed offline; online verification and existing regulated/financial gates are required.",
    };
  }

  return {
    operationType,
    category: "never_finalize_offline",
    allowedOffline: false,
    requiresIdempotencyKey: true,
    replayRequiresOnlineValidation: true,
    highRisk: true,
    reason: "Unknown operation types default to blocked offline until explicitly classified.",
  };
}

export function assertOperationAllowedInMode(
  operationType: OfflineOperationType | string,
  mode: OfflineRuntimeMode,
): OfflineOperationPolicy {
  const policy = getOfflineOperationPolicy(operationType);
  if (mode === "online") return policy;

  if (policy.allowedOffline) return policy;

  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message: `Operation ${operationType} is not allowed in ${mode} mode: ${policy.reason}`,
  });
}
