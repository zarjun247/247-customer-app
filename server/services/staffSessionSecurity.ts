import { and, desc, eq } from "drizzle-orm";
import {
  staffAcknowledgements,
  staffDeviceSessions,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { logAudit } from "./audit";
import { redactSensitiveForLogs } from "./sensitiveDataPolicy";

export const STAFF_ACKNOWLEDGEMENT_TYPES = [
  "patient_data_confidentiality",
  "prescription_handling",
  "H1_register_handling",
  "payment_data_handling",
  "no_shared_accounts",
] as const;

export type StaffAcknowledgementType =
  (typeof STAFF_ACKNOWLEDGEMENT_TYPES)[number];
export type StaffSessionStatus = "active" | "revoked" | "expired";

export const STAFF_SESSION_POLICY = {
  idleTimeoutMinutes: 15,
  absoluteTimeoutHours: 12,
  terminalLockRequired: true,
  cashierPinRequiredForSensitiveActions:
    "use existing PIN/auth pattern before enforcing globally",
  roleSwitchPrevention:
    "single authenticated staff identity per terminal session; no in-session role elevation without re-auth",
  sharedSuperAdminAccounts:
    "prohibited by policy; durable account enforcement remains P1",
} as const;

export interface StaffAcknowledgementRecord {
  id?: number;
  staffId: number;
  acknowledgementType: StaffAcknowledgementType;
  version: string;
  acceptedAt: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt?: Date;
}

export interface StaffDeviceSessionRecord {
  id?: number;
  staffId: number;
  sessionId: string;
  deviceId?: string | null;
  terminalId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  status: StaffSessionStatus;
  lastSeenAt: Date;
  revokedAt?: Date | null;
  revokedBy?: number | null;
  revokeReason?: string | null;
  privilegedLastSeenAt?: Date | null;
  requiresReauth?: boolean | null;
  suspicious?: boolean | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export class InMemoryStaffSecurityStore {
  private nextAckId = 1;
  private nextSessionId = 1;
  readonly acknowledgements: StaffAcknowledgementRecord[] = [];
  readonly sessions: StaffDeviceSessionRecord[] = [];
  readonly audits: Array<{ action: string; afterJson: unknown }> = [];

  insertAcknowledgement(record: StaffAcknowledgementRecord) {
    const saved = { ...record, id: this.nextAckId++, createdAt: new Date() };
    this.acknowledgements.push(saved);
    return Promise.resolve(saved);
  }

  latestAcknowledgement(
    staffId: number,
    acknowledgementType: StaffAcknowledgementType,
    version: string
  ) {
    return Promise.resolve(
      this.acknowledgements
        .filter(
          ack =>
            ack.staffId === staffId &&
            ack.acknowledgementType === acknowledgementType &&
            ack.version === version
        )
        .sort((a, b) => b.acceptedAt.getTime() - a.acceptedAt.getTime())[0] ??
        null
    );
  }

  upsertSession(
    record: Omit<StaffDeviceSessionRecord, "id" | "createdAt" | "updatedAt">
  ) {
    const existing = this.sessions.find(
      session =>
        session.staffId === record.staffId &&
        session.sessionId === record.sessionId
    );
    const now = new Date();
    if (existing) {
      Object.assign(existing, record, { updatedAt: now });
      return Promise.resolve(existing);
    }
    const saved = {
      ...record,
      id: this.nextSessionId++,
      createdAt: now,
      updatedAt: now,
    };
    this.sessions.push(saved);
    return Promise.resolve(saved);
  }

  activeSessions(staffId?: number) {
    return Promise.resolve(
      this.sessions.filter(
        session =>
          session.status === "active" &&
          (staffId == null || session.staffId === staffId)
      )
    );
  }

  revokeSession(sessionId: string, revokedBy: number, reason?: string) {
    const session = this.sessions.find(row => row.sessionId === sessionId);
    if (!session) return Promise.resolve(null);
    session.status = "revoked";
    session.revokedAt = new Date();
    session.revokedBy = revokedBy;
    session.revokeReason = reason ?? null;
    session.updatedAt = new Date();
    return Promise.resolve(session);
  }

  audit(action: string, afterJson: unknown) {
    this.audits.push({ action, afterJson: redactSensitiveForLogs(afterJson) });
    return Promise.resolve();
  }
}

async function auditStaffSecurity(
  action: string,
  actorId: number | null,
  afterJson: unknown,
  store?: InMemoryStaffSecurityStore
) {
  const safe = redactSensitiveForLogs(afterJson);
  if (store) {
    await store.audit(action, safe);
    return;
  }
  await logAudit({
    actorId,
    actorType: actorId ? "user" : "system",
    action,
    entityType: "staff_session_security",
    afterJson: safe,
    source: "staff_security",
  });
}

export async function recordStaffAcknowledgement(
  input: Omit<StaffAcknowledgementRecord, "acceptedAt"> & { acceptedAt?: Date },
  store?: InMemoryStaffSecurityStore
) {
  const record = { ...input, acceptedAt: input.acceptedAt ?? new Date() };
  const saved = store
    ? await store.insertAcknowledgement(record)
    : await insertDbAcknowledgement(record);
  await auditStaffSecurity(
    "staff.acknowledgement.recorded",
    input.staffId,
    {
      staffId: input.staffId,
      acknowledgementType: input.acknowledgementType,
      version: input.version,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    },
    store
  );
  return saved;
}

export async function hasActiveStaffAcknowledgement(
  staffId: number,
  acknowledgementType: StaffAcknowledgementType,
  version: string,
  store?: InMemoryStaffSecurityStore
) {
  const latest = store
    ? await store.latestAcknowledgement(staffId, acknowledgementType, version)
    : await latestDbAcknowledgement(staffId, acknowledgementType, version);
  return Boolean(latest);
}

export async function recordStaffDeviceSession(
  input: Omit<
    StaffDeviceSessionRecord,
    "id" | "status" | "lastSeenAt" | "createdAt" | "updatedAt"
  > & { status?: StaffSessionStatus; lastSeenAt?: Date },
  store?: InMemoryStaffSecurityStore
) {
  const record = {
    ...input,
    status: input.status ?? "active",
    lastSeenAt: input.lastSeenAt ?? new Date(),
    requiresReauth: input.requiresReauth ?? false,
    suspicious: input.suspicious ?? false,
  };
  const saved = store
    ? await store.upsertSession(record)
    : await upsertDbSession(record);
  await auditStaffSecurity(
    "staff.session.recorded",
    input.staffId,
    {
      staffId: input.staffId,
      sessionId: input.sessionId,
      deviceId: input.deviceId,
      terminalId: input.terminalId,
      status: record.status,
    },
    store
  );
  return saved;
}

export async function listActiveStaffSessions(
  staffId?: number,
  store?: InMemoryStaffSecurityStore
) {
  if (store) return store.activeSessions(staffId);
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const filters = [eq(staffDeviceSessions.status, "active")];
  if (staffId != null) filters.push(eq(staffDeviceSessions.staffId, staffId));
  return db
    .select()
    .from(staffDeviceSessions)
    .where(and(...filters))
    .orderBy(desc(staffDeviceSessions.lastSeenAt));
}

export async function revokeStaffSession(
  sessionId: string,
  revokedBy: number,
  reason?: string,
  store?: InMemoryStaffSecurityStore
) {
  const revoked = store
    ? await store.revokeSession(sessionId, revokedBy, reason)
    : await revokeDbSession(sessionId, revokedBy, reason);
  if (revoked) {
    await auditStaffSecurity(
      "staff.session.revoked",
      revokedBy,
      {
        staffId: revoked.staffId,
        sessionId: revoked.sessionId,
        revokedBy,
        reason,
      },
      store
    );
  }
  return revoked;
}

async function insertDbAcknowledgement(record: StaffAcknowledgementRecord) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [row] = await db
    .insert(staffAcknowledgements)
    .values(record)
    .$returningId();
  return { ...record, id: row.id };
}

async function latestDbAcknowledgement(
  staffId: number,
  acknowledgementType: StaffAcknowledgementType,
  version: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const rows = await db
    .select()
    .from(staffAcknowledgements)
    .where(
      and(
        eq(staffAcknowledgements.staffId, staffId),
        eq(staffAcknowledgements.acknowledgementType, acknowledgementType),
        eq(staffAcknowledgements.version, version)
      )
    )
    .orderBy(desc(staffAcknowledgements.acceptedAt))
    .limit(1);
  return rows[0] ?? null;
}

async function upsertDbSession(
  record: Omit<StaffDeviceSessionRecord, "id" | "createdAt" | "updatedAt">
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  type SessionInsert = typeof staffDeviceSessions.$inferInsert;
  await db
    .insert(staffDeviceSessions)
    .values(record as unknown as SessionInsert)
    .onDuplicateKeyUpdate({
      set: {
        ...(record as unknown as Partial<SessionInsert>),
        updatedAt: new Date(),
      },
    });
  const rows = await db
    .select()
    .from(staffDeviceSessions)
    .where(
      and(
        eq(staffDeviceSessions.staffId, record.staffId),
        eq(staffDeviceSessions.sessionId, record.sessionId)
      )
    )
    .limit(1);
  return rows[0] as StaffDeviceSessionRecord;
}

async function revokeDbSession(
  sessionId: string,
  revokedBy: number,
  reason?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [existing] = await db
    .select()
    .from(staffDeviceSessions)
    .where(eq(staffDeviceSessions.sessionId, sessionId))
    .limit(1);
  if (!existing) return null;
  await db
    .update(staffDeviceSessions)
    .set({
      status: "revoked",
      revokedAt: new Date(),
      revokedBy,
      revokeReason: reason ?? null,
    })
    .where(eq(staffDeviceSessions.sessionId, sessionId));
  return {
    ...existing,
    status: "revoked",
    revokedAt: new Date(),
    revokedBy,
    revokeReason: reason ?? null,
  } as StaffDeviceSessionRecord;
}
