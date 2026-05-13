import pino from "pino";
import fs from "fs";
import path from "path";
import { ENV } from "../_core/env";

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

// Interim storage: rota lives in a JSON file. A future PR will migrate this to an
// on_call_shifts table with proper RBAC and audit. Until then, back up this file.
const ROTA_PATH = path.join(process.cwd(), "server/data/oncall-rota.json");

export type OnCallRole =
  | "incident_commander"
  | "pharmacist_in_charge"
  | "platform_owner"
  | "provider_owner";

export type OnCallShift = {
  id: string;
  role: OnCallRole;
  primaryUserId: string;
  secondaryUserId?: string;
  escalationUserId?: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
};

type RotaFile = { shifts: OnCallShift[] };

function readRota(): RotaFile {
  try {
    const raw = fs.readFileSync(ROTA_PATH, "utf-8");
    return JSON.parse(raw) as RotaFile;
  } catch {
    return { shifts: [] };
  }
}

function writeRota(data: RotaFile): void {
  fs.writeFileSync(ROTA_PATH, JSON.stringify(data, null, 2), "utf-8");
}

export function getCurrentOnCall(
  role: OnCallRole
): Promise<OnCallShift | null> {
  const rota = readRota();
  const now = new Date().toISOString();
  return Promise.resolve(
    rota.shifts.find(
      s => s.role === role && s.startsAt <= now && s.endsAt >= now
    ) ?? null
  );
}

export function listUpcomingShifts(
  role: OnCallRole,
  days = 7
): Promise<OnCallShift[]> {
  const rota = readRota();
  const now = new Date().toISOString();
  const cutoff = new Date(Date.now() + days * 86_400_000).toISOString();
  return Promise.resolve(
    rota.shifts.filter(
      s => s.role === role && s.endsAt >= now && s.startsAt <= cutoff
    )
  );
}

export function upsertShift(input: OnCallShift): Promise<void> {
  const rota = readRota();
  const idx = rota.shifts.findIndex(s => s.id === input.id);
  if (idx >= 0) {
    rota.shifts[idx] = input;
  } else {
    rota.shifts.push(input);
  }
  writeRota(rota);
  return Promise.resolve();
}

export function listAllShifts(): Promise<OnCallShift[]> {
  return Promise.resolve(readRota().shifts);
}

async function sendPagerDutyAlert(
  integrationKey: string,
  severity: string,
  role: OnCallRole,
  context: Record<string, unknown>
): Promise<void> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    await fetch("https://events.pagerduty.com/v2/enqueue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        routing_key: integrationKey,
        event_action: "trigger",
        payload: {
          summary: `On-call escalation: ${role} (${severity})`,
          severity:
            severity === "P0"
              ? "critical"
              : severity === "P1"
                ? "error"
                : "warning",
          source: "247-pharmacy-os",
          custom_details: context,
        },
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
  } catch (err) {
    logger.warn(
      { event: "pagerduty_send_failed", role, reason: (err as Error)?.message },
      "pagerduty_send_failed"
    );
  }
}

export async function escalate(
  severity: string,
  role: OnCallRole,
  context: Record<string, unknown>
): Promise<void> {
  logger.info(
    { event: "oncall_escalation", severity, role, context },
    "oncall_escalation"
  );

  const currentShift = await getCurrentOnCall(role);
  if (currentShift) {
    logger.info(
      {
        event: "oncall_escalation_target",
        role,
        primaryUserId: currentShift.primaryUserId,
      },
      "oncall_escalation_target"
    );
  } else {
    logger.warn(
      { event: "oncall_no_shift_found", role },
      "oncall_no_shift_found"
    );
  }

  const pdKey = ENV.onCallPagerDutyIntegrationKey;
  if (pdKey) {
    await sendPagerDutyAlert(pdKey, severity, role, {
      ...context,
      currentShift: currentShift ?? null,
    });
    return;
  }

  const alertEmail = ENV.onCallAlertEmail;
  if (alertEmail) {
    logger.info(
      { event: "oncall_alert_email_fallback", to: alertEmail, role, severity },
      "oncall_alert_email_fallback: set ONCALL_PAGERDUTY_INTEGRATION_KEY to enable PagerDuty"
    );
  } else {
    logger.warn(
      { event: "pagerduty_not_configured", role },
      "pagerduty_not_configured: set ONCALL_PAGERDUTY_INTEGRATION_KEY"
    );
  }
}
