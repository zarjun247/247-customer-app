import { randomUUID } from "crypto";
import pino from "pino";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../db";
import { capabilityDefinitions, capabilityGrants } from "../../drizzle/schema";
import { appendChainedAudit } from "./auditHashChain";

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });

// Role-default fallback: capability is implicitly granted when the user holds one
// of these roles. Explicit grants in capability_grants always take precedence but
// the fallback keeps existing role-based access working during the pilot migration.
export const CAPABILITY_ROLE_DEFAULTS: Readonly<
  Record<string, readonly string[]>
> = {
  "inventory.adjust": ["admin", "super_admin", "ops_admin", "store_manager"],
  "refund.large": ["admin", "super_admin", "ops_admin"],
  "audit.view": ["admin", "super_admin", "ops_admin", "auditor"],
  "audit.export": ["admin", "super_admin", "ops_admin"],
  "rbac.grant": ["super_admin"],
  "rbac.revoke": ["super_admin"],
  "chaos.trigger": ["super_admin", "ops_admin"],
  "pii.decrypt-bulk": ["super_admin"],
  "user.create": ["admin", "super_admin", "ops_admin"],
  "user.delete": ["super_admin"],
  "store.create": ["super_admin"],
  "store.close": ["super_admin"],
};

export class CapabilityDefinitionNotFoundError extends Error {
  constructor(capabilityName: string) {
    super(`Capability definition not found: ${capabilityName}`);
    this.name = "CapabilityDefinitionNotFoundError";
  }
}

export class ActiveGrantNotFoundError extends Error {
  constructor(userId: string | number, capabilityName: string) {
    super(
      `No active grant found for user=${userId}, capability=${capabilityName}`
    );
    this.name = "ActiveGrantNotFoundError";
  }
}

export type GrantCapabilityParams = {
  userId: string | number;
  capabilityName: string;
  grantedByUserId?: string | number | null;
  expiresAt?: Date | null;
  reason?: string | null;
};

export type RevokeCapabilityParams = {
  userId: string | number;
  capabilityName: string;
  revokedByUserId?: string | number | null;
  reason?: string | null;
};

export type CapabilityGrantRow = {
  id: string;
  userId: string;
  capabilityName: string;
  grantedByUserId: string | null;
  grantedAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
  revokedByUserId: string | null;
  reason: string | null;
};

// ─── Grant ────────────────────────────────────────────────────────────────────

export async function grantCapability(
  params: GrantCapabilityParams
): Promise<{ id: string }> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable for capability grant");

  const userIdStr = String(params.userId);
  const grantedByStr =
    params.grantedByUserId != null ? String(params.grantedByUserId) : null;

  const [def] = await db
    .select()
    .from(capabilityDefinitions)
    .where(eq(capabilityDefinitions.capabilityName, params.capabilityName))
    .limit(1);

  if (!def) throw new CapabilityDefinitionNotFoundError(params.capabilityName);

  const id = randomUUID();
  await db.insert(capabilityGrants).values({
    id,
    userId: userIdStr,
    capabilityName: params.capabilityName,
    grantedByUserId: grantedByStr,
    expiresAt: params.expiresAt ?? null,
    revokedAt: null,
    revokedByUserId: null,
    reason: params.reason ?? null,
  });

  await appendChainedAudit({
    action: "capability.granted",
    entityType: "capability_grant",
    entityId: id,
    actorUserId:
      params.grantedByUserId != null ? Number(params.grantedByUserId) : null,
    afterJson: {
      userId: userIdStr,
      capabilityName: params.capabilityName,
      expiresAt: params.expiresAt ?? null,
    },
  });

  logger.info({
    capabilityName: params.capabilityName,
    userId: userIdStr,
    msg: "capabilityGrant: granted",
  });
  return { id };
}

// ─── Revoke ───────────────────────────────────────────────────────────────────

export async function revokeCapability(
  params: RevokeCapabilityParams
): Promise<{ id: string }> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable for capability revoke");

  const userIdStr = String(params.userId);
  const revokedByStr =
    params.revokedByUserId != null ? String(params.revokedByUserId) : null;

  const [existing] = await db
    .select()
    .from(capabilityGrants)
    .where(
      and(
        eq(capabilityGrants.userId, userIdStr),
        eq(capabilityGrants.capabilityName, params.capabilityName),
        isNull(capabilityGrants.revokedAt)
      )
    )
    .limit(1);

  if (!existing)
    throw new ActiveGrantNotFoundError(params.userId, params.capabilityName);

  const now = new Date();
  await db
    .update(capabilityGrants)
    .set({
      revokedAt: now,
      revokedByUserId: revokedByStr,
      reason: params.reason ?? existing.reason,
    })
    .where(eq(capabilityGrants.id, existing.id));

  await appendChainedAudit({
    action: "capability.revoked",
    entityType: "capability_grant",
    entityId: existing.id,
    actorUserId:
      params.revokedByUserId != null ? Number(params.revokedByUserId) : null,
    afterJson: {
      userId: userIdStr,
      capabilityName: params.capabilityName,
      revokedAt: now.toISOString(),
    },
  });

  logger.info({
    capabilityName: params.capabilityName,
    userId: userIdStr,
    msg: "capabilityGrant: revoked",
  });
  return { id: existing.id };
}

// ─── Query ────────────────────────────────────────────────────────────────────

export function roleHasCapabilityDefault(
  role: string | null | undefined,
  capabilityName: string
): boolean {
  if (!role) return false;
  return (CAPABILITY_ROLE_DEFAULTS[capabilityName] ?? []).includes(role);
}

export async function hasCapability(
  userId: string | number,
  capabilityName: string,
  now: Date = new Date(),
  userRole?: string | null
): Promise<boolean> {
  // Fast path: role-based default grants access without a DB round-trip
  if (userRole && roleHasCapabilityDefault(userRole, capabilityName))
    return true;
  const db = await getDb();
  if (!db) return false;

  const userIdStr = String(userId);

  const [row] = await db
    .select()
    .from(capabilityGrants)
    .where(
      and(
        eq(capabilityGrants.userId, userIdStr),
        eq(capabilityGrants.capabilityName, capabilityName),
        isNull(capabilityGrants.revokedAt)
      )
    )
    .limit(1);

  if (!row) return false;
  if (row.expiresAt && row.expiresAt <= now) return false;
  return true;
}

export async function getUserCapabilities(
  userId: string | number,
  now: Date = new Date()
): Promise<CapabilityGrantRow[]> {
  const db = await getDb();
  if (!db) return [];

  const userIdStr = String(userId);

  const rows = await db
    .select()
    .from(capabilityGrants)
    .where(
      and(
        eq(capabilityGrants.userId, userIdStr),
        isNull(capabilityGrants.revokedAt)
      )
    )
    .limit(1_000);

  const active = rows.filter(r => !r.expiresAt || r.expiresAt > now);
  return active;
}

export async function listGrants(params?: {
  userId?: string | number;
  capabilityName?: string;
  includeRevoked?: boolean;
  limit?: number;
}): Promise<CapabilityGrantRow[]> {
  const db = await getDb();
  if (!db) return [];

  const limit = params?.limit ?? 500;

  const conditions = [];
  if (params?.userId != null)
    conditions.push(eq(capabilityGrants.userId, String(params.userId)));
  if (params?.capabilityName)
    conditions.push(eq(capabilityGrants.capabilityName, params.capabilityName));
  if (!params?.includeRevoked)
    conditions.push(isNull(capabilityGrants.revokedAt));

  const rows =
    conditions.length > 0
      ? await db
          .select()
          .from(capabilityGrants)
          .where(and(...conditions))
          .limit(limit)
      : await db.select().from(capabilityGrants).limit(limit);

  return rows;
}

export async function getCapabilityDefinitions(): Promise<
  Array<{ capabilityName: string; description: string; riskLevel: string }>
> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(capabilityDefinitions).limit(1_000);
  return rows.map(r => ({
    capabilityName: r.capabilityName,
    description: r.description,
    riskLevel: r.riskLevel,
  }));
}
