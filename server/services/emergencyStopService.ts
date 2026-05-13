import { eq } from "drizzle-orm";
import pino from "pino";
import { getDb } from "../db";
import { systemSettings } from "../../drizzle/schema";
import { appendChainedAudit } from "./auditHashChain";

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

const STOP_KEY = "app_emergency_stop";

export type EmergencyStopFlag = {
  active: boolean;
  reason: string | null;
  activatedAt: Date | null;
};

type StopFlagPayload = {
  active?: boolean;
  reason?: string | null;
  activated_at?: string | null;
};

const CACHE_TTL_MS = 5_000;
let cachedFlag: EmergencyStopFlag | null = null;
let cacheExpiresAt = 0;

/**
 * Reads the current emergency stop flag from the DB, with a 5-second TTL cache.
 * Fails open: returns `{ active: false }` if the DB is unreachable.
 *
 * @returns Current flag state; never throws
 */
export async function readFlag(): Promise<EmergencyStopFlag> {
  if (cachedFlag !== null && Date.now() < cacheExpiresAt) {
    return cachedFlag;
  }

  const db = await getDb();
  if (!db) {
    // DB unavailable — fail open so operations are not blocked by DB outage
    return { active: false, reason: null, activatedAt: null };
  }

  const rows = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.settingKey, STOP_KEY))
    .limit(1);

  let value: StopFlagPayload = {};
  try {
    const raw = rows[0]?.settingValue;
    if (raw) value = JSON.parse(raw) as StopFlagPayload;
  } catch {
    // Malformed JSON — treat as inactive
  }

  const flag: EmergencyStopFlag = {
    active: value?.active === true,
    reason: value?.reason ?? null,
    activatedAt: value?.activated_at ? new Date(value.activated_at) : null,
  };

  cachedFlag = flag;
  cacheExpiresAt = Date.now() + CACHE_TTL_MS;
  return flag;
}

function invalidateCache(): void {
  cachedFlag = null;
  cacheExpiresAt = 0;
}

export function _testOnlyInvalidateCache(): void {
  invalidateCache();
}

/**
 * Sets or clears the emergency stop flag, invalidates the local cache, and
 * appends a tamper-evident audit chain entry.
 *
 * @param active - `true` to activate the stop; `false` to clear it
 * @param reason - Human-readable reason shown in the 503 response
 * @param userId - Staff user ID initiating the change (for audit)
 * @throws Error if DB is unavailable
 */
export async function setFlag(
  active: boolean,
  reason: string | null,
  userId: number | null
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable; cannot set emergency stop flag");

  const now = new Date();
  const payload: StopFlagPayload = {
    active,
    reason,
    activated_at: active ? now.toISOString() : null,
  };
  const valueStr = JSON.stringify(payload);

  await db
    .insert(systemSettings)
    .values({
      settingKey: STOP_KEY,
      settingValue: valueStr,
      settingType: "json",
      description:
        "Emergency stop flag — active=true blocks customer mutations and worker ticks",
      updatedBy: userId,
    })
    .onDuplicateKeyUpdate({
      set: {
        settingValue: valueStr,
        updatedBy: userId,
        updatedAt: now,
      },
    });

  invalidateCache();

  await appendChainedAudit({
    action: active ? "emergency_stop.set" : "emergency_stop.cleared",
    entityType: "system_settings",
    entityId: STOP_KEY,
    actorUserId: userId,
    afterJson: payload,
  }).catch((err: unknown) => {
    logger.error(
      { err },
      "emergencyStop: audit chain append failed (non-fatal)"
    );
  });

  logger.info(
    { active, reason, userId },
    active ? "Emergency stop SET" : "Emergency stop CLEARED"
  );
}
