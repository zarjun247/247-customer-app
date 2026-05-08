export type ProviderContractName =
  | "razorpay_payment"
  | "whatsapp"
  | "otp"
  | "sms"
  | "email"
  | "push_notification"
  | "ocr"
  | "object_storage"
  | "maps_geocoding_delivery_distance"
  | "tally_erp_export"
  | "printer_label_printing";

export type ProviderFailureMode =
  | "fail_closed"
  | "disabled_safe"
  | "preview_only"
  | "manual_only";

export type ProviderSuccessState =
  | "verified"
  | "sent"
  | "delivered"
  | "stored"
  | "ocr_complete_pending_review"
  | "distance_calculated"
  | "export_generated"
  | "synced"
  | "printed"
  | "preview_generated";

export type ProviderUnavailableState =
  | "provider_unconfigured"
  | "disabled"
  | "demo_skipped"
  | "preview_only"
  | "manual_only"
  | "failed"
  | "pending_manual_review"
  | "export_generated_not_synced"
  | "not_printed";

export type OpsDashboardStatus =
  | "configured"
  | "provider_unconfigured"
  | "disabled"
  | "demo_skipped"
  | "preview_only"
  | "failed"
  | "unknown"
  | "retry_scheduled"
  | "dead_letter"
  | "manual_intervention_required";

export type ProviderContract = {
  providerName: ProviderContractName;
  domain: string;
  requiredEnvVars: string[];
  optionalEnvVars: string[];
  productionRequired: boolean;
  demoAllowed: boolean;
  failureMode: ProviderFailureMode;
  successStates: ProviderSuccessState[];
  unavailableStates: ProviderUnavailableState[];
  auditRequired: boolean;
  retryRequired: boolean;
  deadLetterRequired: boolean;
  manualInterventionEvents: string[];
  opsDashboardStatuses: OpsDashboardStatus[];
  notes: string;
};

export const providerContracts: readonly ProviderContract[] = [
  {
    providerName: "razorpay_payment",
    domain: "payment",
    requiredEnvVars: ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"],
    optionalEnvVars: ["RAZORPAY_WEBHOOK_SECRET", "PAYMENT_PROVIDER_ENABLED", "PAYMENT_WEBHOOK_ENABLED"],
    productionRequired: true,
    demoAllowed: true,
    failureMode: "fail_closed",
    successStates: ["verified"],
    unavailableStates: ["provider_unconfigured", "demo_skipped", "failed"],
    auditRequired: true,
    retryRequired: false,
    deadLetterRequired: false,
    manualInterventionEvents: ["payment_provider_unconfigured", "payment_verification_failed", "payment_webhook_unverified"],
    opsDashboardStatuses: ["configured", "provider_unconfigured", "demo_skipped", "failed", "manual_intervention_required"],
    notes: "Production payment success requires real Razorpay verification. Env presence means configured only, not production-ready or verified.",
  },
  {
    providerName: "whatsapp",
    domain: "messaging",
    requiredEnvVars: ["WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_API_TOKEN"],
    optionalEnvVars: ["WHATSAPP_WEBHOOK_SECRET", "WHATSAPP_PROVIDER_ENABLED"],
    productionRequired: false,
    demoAllowed: true,
    failureMode: "fail_closed",
    successStates: ["sent", "delivered"],
    unavailableStates: ["provider_unconfigured", "demo_skipped", "failed"],
    auditRequired: true,
    retryRequired: true,
    deadLetterRequired: true,
    manualInterventionEvents: ["whatsapp_send_dead_letter", "regulated_whatsapp_intent", "webhook_signature_failed"],
    opsDashboardStatuses: ["configured", "provider_unconfigured", "demo_skipped", "failed", "retry_scheduled", "dead_letter", "manual_intervention_required"],
    notes: "WhatsApp Cloud API send failures should retry and dead-letter after max attempts; regulated flows stay staff/pharmacist gated.",
  },
  {
    providerName: "otp",
    domain: "authentication",
    requiredEnvVars: ["OTP_PROVIDER_API_KEY", "OTP_RATE_LIMIT_BACKEND"],
    optionalEnvVars: ["OTP_PROVIDER_ENABLED"],
    productionRequired: true,
    demoAllowed: false,
    failureMode: "fail_closed",
    successStates: ["sent", "verified"],
    unavailableStates: ["provider_unconfigured", "disabled", "failed"],
    auditRequired: true,
    retryRequired: true,
    deadLetterRequired: false,
    manualInterventionEvents: ["otp_provider_unconfigured", "otp_rate_limit_backend_invalid"],
    opsDashboardStatuses: ["configured", "provider_unconfigured", "disabled", "failed", "retry_scheduled", "manual_intervention_required"],
    notes: "Production OTP requires provider credentials and an explicit production-safe rate-limit backend; dev codes must not appear in production.",
  },
  {
    providerName: "sms",
    domain: "messaging",
    requiredEnvVars: ["SMS_PROVIDER_API_KEY"],
    optionalEnvVars: ["SMS_SENDER_ID", "SMS_PROVIDER_ENABLED"],
    productionRequired: false,
    demoAllowed: true,
    failureMode: "fail_closed",
    successStates: ["sent", "delivered"],
    unavailableStates: ["provider_unconfigured", "demo_skipped", "failed"],
    auditRequired: true,
    retryRequired: true,
    deadLetterRequired: true,
    manualInterventionEvents: ["sms_send_dead_letter", "customer_notification_fallback"],
    opsDashboardStatuses: ["configured", "provider_unconfigured", "demo_skipped", "failed", "retry_scheduled", "dead_letter", "manual_intervention_required"],
    notes: "MSG91 SMS sends may be retried; unconfigured/demo paths are never sent.",
  },
  {
    providerName: "email",
    domain: "messaging",
    requiredEnvVars: ["EMAIL_PROVIDER_API_KEY"],
    optionalEnvVars: ["EMAIL_FROM", "EMAIL_PROVIDER_ENABLED", "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD"],
    productionRequired: false,
    demoAllowed: true,
    failureMode: "disabled_safe",
    successStates: ["sent", "delivered"],
    unavailableStates: ["disabled", "provider_unconfigured", "demo_skipped", "failed"],
    auditRequired: true,
    retryRequired: true,
    deadLetterRequired: true,
    manualInterventionEvents: ["email_send_dead_letter"],
    opsDashboardStatuses: ["configured", "provider_unconfigured", "disabled", "demo_skipped", "failed", "retry_scheduled", "dead_letter"],
    notes: "No dedicated runtime connector was found in this branch; contract reserves disabled-safe behavior until an adapter is wired.",
  },
  {
    providerName: "push_notification",
    domain: "messaging",
    requiredEnvVars: ["PUSH_PROVIDER_API_KEY"],
    optionalEnvVars: ["PUSH_PROVIDER_ENABLED", "FCM_PROJECT_ID", "FCM_CLIENT_EMAIL", "FCM_PRIVATE_KEY"],
    productionRequired: false,
    demoAllowed: true,
    failureMode: "disabled_safe",
    successStates: ["sent", "delivered"],
    unavailableStates: ["disabled", "provider_unconfigured", "demo_skipped", "failed"],
    auditRequired: true,
    retryRequired: true,
    deadLetterRequired: true,
    manualInterventionEvents: ["push_send_dead_letter"],
    opsDashboardStatuses: ["configured", "provider_unconfigured", "disabled", "demo_skipped", "failed", "retry_scheduled", "dead_letter"],
    notes: "No dedicated push connector was found in this branch; missing provider must degrade safely instead of claiming delivery.",
  },
  {
    providerName: "ocr",
    domain: "purchase_inwarding",
    requiredEnvVars: ["OCR_PROVIDER_API_KEY"],
    optionalEnvVars: ["OCR_PROVIDER_ENABLED", "OCR_PROVIDER_NAME"],
    productionRequired: false,
    demoAllowed: false,
    failureMode: "manual_only",
    successStates: ["ocr_complete_pending_review"],
    unavailableStates: ["disabled", "provider_unconfigured", "failed", "pending_manual_review", "manual_only"],
    auditRequired: true,
    retryRequired: true,
    deadLetterRequired: true,
    manualInterventionEvents: ["ocr_provider_failed", "ocr_low_confidence", "ocr_disabled_manual_entry", "draft_pending_review"],
    opsDashboardStatuses: ["configured", "provider_unconfigured", "disabled", "failed", "retry_scheduled", "dead_letter", "manual_intervention_required"],
    notes: "OCR output is assistive only; purchase/stock mutation requires reviewed approval/commit and must not auto-commit from provider output.",
  },
  {
    providerName: "object_storage",
    domain: "storage",
    requiredEnvVars: ["BUILT_IN_FORGE_API_URL", "BUILT_IN_FORGE_API_KEY"],
    optionalEnvVars: ["STORAGE_PROVIDER_ENABLED", "S3_BUCKET", "AWS_REGION"],
    productionRequired: true,
    demoAllowed: false,
    failureMode: "fail_closed",
    successStates: ["stored"],
    unavailableStates: ["provider_unconfigured", "disabled", "failed"],
    auditRequired: true,
    retryRequired: true,
    deadLetterRequired: true,
    manualInterventionEvents: ["storage_provider_unconfigured", "sensitive_file_access_denied", "upload_dead_letter"],
    opsDashboardStatuses: ["configured", "provider_unconfigured", "disabled", "failed", "retry_scheduled", "dead_letter", "manual_intervention_required"],
    notes: "Sensitive prescription/file access must stay authenticated, audited, and fail closed when storage provider configuration is missing.",
  },
  {
    providerName: "maps_geocoding_delivery_distance",
    domain: "delivery",
    requiredEnvVars: ["GOOGLE_MAPS_API_KEY"],
    optionalEnvVars: ["MAPS_PROVIDER_ENABLED"],
    productionRequired: false,
    demoAllowed: true,
    failureMode: "manual_only",
    successStates: ["distance_calculated"],
    unavailableStates: ["disabled", "provider_unconfigured", "demo_skipped", "failed", "manual_only"],
    auditRequired: false,
    retryRequired: true,
    deadLetterRequired: false,
    manualInterventionEvents: ["geocode_failed", "delivery_distance_manual_override"],
    opsDashboardStatuses: ["configured", "provider_unconfigured", "disabled", "demo_skipped", "failed", "retry_scheduled", "manual_intervention_required"],
    notes: "Maps/distance functionality is optional; unconfigured provider must require manual distance/routing rather than inventing a calculation.",
  },
  {
    providerName: "tally_erp_export",
    domain: "accounting_erp",
    requiredEnvVars: ["ERP_BASE_URL", "ERP_API_KEY"],
    optionalEnvVars: ["ERP_COMPANY_ID", "ERP_PROVIDER_ENABLED"],
    productionRequired: false,
    demoAllowed: true,
    failureMode: "manual_only",
    successStates: ["export_generated", "synced"],
    unavailableStates: ["provider_unconfigured", "demo_skipped", "failed", "export_generated_not_synced", "manual_only"],
    auditRequired: true,
    retryRequired: true,
    deadLetterRequired: true,
    manualInterventionEvents: ["erp_sync_dead_letter", "tally_import_manual", "export_generated_not_synced"],
    opsDashboardStatuses: ["configured", "provider_unconfigured", "demo_skipped", "failed", "retry_scheduled", "dead_letter", "manual_intervention_required"],
    notes: "Tally CSV/export generation is distinct from ERP sync/import. Generated/exported is not synced unless a real ERP response confirms it.",
  },
  {
    providerName: "printer_label_printing",
    domain: "printing",
    requiredEnvVars: ["PRINTER_HOST"],
    optionalEnvVars: ["PRINTER_PORT", "PRINTER_PROVIDER_ENABLED"],
    productionRequired: false,
    demoAllowed: true,
    failureMode: "preview_only",
    successStates: ["printed", "preview_generated"],
    unavailableStates: ["provider_unconfigured", "demo_skipped", "preview_only", "not_printed", "failed"],
    auditRequired: true,
    retryRequired: true,
    deadLetterRequired: true,
    manualInterventionEvents: ["printer_unavailable", "label_preview_generated", "print_job_dead_letter"],
    opsDashboardStatuses: ["configured", "provider_unconfigured", "demo_skipped", "preview_only", "failed", "retry_scheduled", "dead_letter", "manual_intervention_required"],
    notes: "Printer unavailability may generate preview/ZPL/manual fallback but must never be labelled printed without a real print path.",
  },
] as const;

export const providerContractNames = providerContracts.map(contract => contract.providerName) as ProviderContractName[];
