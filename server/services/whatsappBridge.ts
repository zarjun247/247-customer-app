import { triageSupportIssue } from "./supportService";
export function normalizeInboundWhatsappMessage(input: {
  phone: string;
  body?: string;
}) {
  const body = (input.body ?? "").trim();
  const triage = triageSupportIssue(body);
  return {
    ...input,
    body,
    intent: triage.needsHuman ? "support_escalation" : "order_or_support",
    escalateToHuman: triage.needsHuman,
  };
}
export function processWhatsappInbound(input: {
  phone: string;
  body?: string;
}) {
  const normalized = normalizeInboundWhatsappMessage(input);
  const regulatedIntent =
    /(rx|prescription|dose|dosage|h1|schedule h|controlled|narcotic)/i.test(
      input.body ?? ""
    );
  return {
    normalized,
    providerConfigured: Boolean(process.env.WHATSAPP_TOKEN),
    regulatedIntent,
    escalateToHuman: regulatedIntent || normalized.escalateToHuman,
    autoApproveRegulatedSale: false,
  };
}
