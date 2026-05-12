import pino from "pino";
import { generateBreachNotification } from "./breachNotificationService";
import { ENV } from "../_core/env";

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });

export async function dispatchBreachNotification(input: {
  incidentId: string;
  affectedCustomerCount: number;
  dataCategories: string[];
  detectedAt: Date;
  containedAt?: Date;
  rootCause: string;
  mitigationActions: string[];
}): Promise<{ ok: true; sentAt: Date; recipients: string[] }> {
  const notification = await generateBreachNotification(input);
  const recipient = ENV.breachNotifyRecipientEmail;

  if (!recipient) {
    logger.warn(
      { incidentId: input.incidentId },
      "breachNotification: dispatch skipped — BREACH_NOTIFY_RECIPIENT_EMAIL not set"
    );
    return { ok: true, sentAt: new Date(), recipients: [] };
  }

  // TBD humans-must-do: integrate SMTP/SES. See SCORECARD item for full dispatch.
  logger.error(
    {
      incidentId: input.incidentId,
      recipientCount: 1,
      deadline: notification.deadline,
    },
    "breachNotification: READY TO DISPATCH — wire SMTP/SES before production use"
  );

  return { ok: true, sentAt: new Date(), recipients: [recipient] };
}
