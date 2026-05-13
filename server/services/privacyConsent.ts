import { and, desc, eq, or } from "drizzle-orm";
import { getDb } from "../db";
import { logAudit } from "./audit";
import { privacyConsents } from "../../drizzle/schema";
import { redactSensitiveForLogs } from "./sensitiveDataPolicy";

export const PRIVACY_CONSENT_TYPES = [
  "prescription_storage",
  "refill_reminder",
  "dosage_reminder",
  "whatsapp_transactional",
  "whatsapp_marketing",
  "sms_transactional",
  "sms_marketing",
  "family_profile_access",
  "invoice_claim_bundle",
] as const;

export type PrivacyConsentType = (typeof PRIVACY_CONSENT_TYPES)[number];
export type PrivacyConsentStatus = "granted" | "revoked" | "pending";
export type PrivacyConsentSource =
  | "app"
  | "staff"
  | "whatsapp"
  | "import"
  | "system";

export interface PrivacyConsentRecord {
  id?: number;
  userId?: number | null;
  customerId?: number | null;
  phone?: string | null;
  email?: string | null;
  consentType: PrivacyConsentType;
  status: PrivacyConsentStatus;
  source: PrivacyConsentSource;
  grantedAt?: Date | null;
  revokedAt?: Date | null;
  changedBy?: number | null;
  auditRef?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ConsentActorContext {
  changedBy?: number | null;
  source?: PrivacyConsentSource;
  auditRef?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export type ConsentSubject = {
  userId?: number | null;
  customerId?: number | null;
  phone?: string | null;
  email?: string | null;
};

export class ConsentRequiredError extends Error {
  constructor(
    public readonly consentType: PrivacyConsentType,
    message = `Explicit ${consentType} consent is required`
  ) {
    super(message);
    this.name = "ConsentRequiredError";
  }
}

function sameSubject(
  record: PrivacyConsentRecord,
  subject: ConsentSubject
): boolean {
  return Boolean(
    (subject.userId != null && record.userId === subject.userId) ||
      (subject.customerId != null &&
        record.customerId === subject.customerId) ||
      (subject.phone && record.phone === subject.phone) ||
      (subject.email && record.email === subject.email)
  );
}

function newestFirst(a: PrivacyConsentRecord, b: PrivacyConsentRecord) {
  return (
    (
      b.updatedAt ??
      b.createdAt ??
      b.grantedAt ??
      b.revokedAt ??
      new Date(0)
    ).getTime() -
    (
      a.updatedAt ??
      a.createdAt ??
      a.grantedAt ??
      a.revokedAt ??
      new Date(0)
    ).getTime()
  );
}

export class InMemoryPrivacyConsentStore {
  private nextId = 1;
  readonly records: PrivacyConsentRecord[] = [];
  readonly audits: Array<{ action: string; afterJson: unknown }> = [];

  append(record: PrivacyConsentRecord): Promise<PrivacyConsentRecord> {
    const now = new Date();
    const saved = {
      ...record,
      id: this.nextId++,
      createdAt: now,
      updatedAt: now,
    };
    this.records.push(saved);
    return Promise.resolve(saved);
  }

  latest(
    subject: ConsentSubject,
    consentType: PrivacyConsentType
  ): Promise<PrivacyConsentRecord | null> {
    return Promise.resolve(
      this.records
        .filter(r => r.consentType === consentType && sameSubject(r, subject))
        .sort(newestFirst)[0] ?? null
    );
  }

  trail(
    subject: ConsentSubject,
    consentType?: PrivacyConsentType
  ): Promise<PrivacyConsentRecord[]> {
    return Promise.resolve(
      this.records
        .filter(
          r =>
            (!consentType || r.consentType === consentType) &&
            sameSubject(r, subject)
        )
        .sort(newestFirst)
    );
  }

  audit(action: string, afterJson: unknown): Promise<void> {
    this.audits.push({ action, afterJson: redactSensitiveForLogs(afterJson) });
    return Promise.resolve();
  }
}

async function writeConsentAudit(
  action: string,
  record: PrivacyConsentRecord,
  context: ConsentActorContext,
  memoryStore?: InMemoryPrivacyConsentStore
) {
  const afterJson = redactSensitiveForLogs({
    consentType: record.consentType,
    status: record.status,
    source: record.source,
    userId: record.userId,
    customerId: record.customerId,
    phone: record.phone,
    email: record.email,
    auditRef: record.auditRef,
  });
  if (memoryStore) {
    await memoryStore.audit(action, afterJson);
    return;
  }
  await logAudit({
    actorId: context.changedBy ?? null,
    actorType: context.changedBy ? "user" : "system",
    action,
    entityType: "privacy_consent",
    entityId: record.id ?? null,
    afterJson,
    source: record.source,
    ipAddress: context.ipAddress ?? null,
    userAgent: context.userAgent ?? null,
  });
}

async function appendDbConsent(
  record: PrivacyConsentRecord
): Promise<PrivacyConsentRecord> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [row] = await db.insert(privacyConsents).values(record).$returningId();
  return { ...record, id: row.id };
}

async function latestDbConsent(
  subject: ConsentSubject,
  consentType: PrivacyConsentType
): Promise<PrivacyConsentRecord | null> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const subjectClauses = [];
  if (subject.userId != null)
    subjectClauses.push(eq(privacyConsents.userId, subject.userId));
  if (subject.customerId != null)
    subjectClauses.push(eq(privacyConsents.customerId, subject.customerId));
  if (subject.phone)
    subjectClauses.push(eq(privacyConsents.phone, subject.phone));
  if (subject.email)
    subjectClauses.push(eq(privacyConsents.email, subject.email));
  if (subjectClauses.length === 0) return null;
  const rows = await db
    .select()
    .from(privacyConsents)
    .where(
      and(eq(privacyConsents.consentType, consentType), or(...subjectClauses))
    )
    .orderBy(desc(privacyConsents.updatedAt))
    .limit(1);
  return rows[0] ?? null;
}

async function trailDbConsent(
  subject: ConsentSubject,
  consentType?: PrivacyConsentType
): Promise<PrivacyConsentRecord[]> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const subjectClauses = [];
  if (subject.userId != null)
    subjectClauses.push(eq(privacyConsents.userId, subject.userId));
  if (subject.customerId != null)
    subjectClauses.push(eq(privacyConsents.customerId, subject.customerId));
  if (subject.phone)
    subjectClauses.push(eq(privacyConsents.phone, subject.phone));
  if (subject.email)
    subjectClauses.push(eq(privacyConsents.email, subject.email));
  if (subjectClauses.length === 0) return [];
  const filters = [or(...subjectClauses)];
  if (consentType) filters.push(eq(privacyConsents.consentType, consentType));
  return db
    .select()
    .from(privacyConsents)
    .where(and(...filters))
    .orderBy(desc(privacyConsents.updatedAt));
}

export async function grantConsent(
  subject: ConsentSubject,
  consentType: PrivacyConsentType,
  context: ConsentActorContext = {},
  store?: InMemoryPrivacyConsentStore
) {
  const now = new Date();
  const record: PrivacyConsentRecord = {
    ...subject,
    consentType,
    status: "granted",
    source: context.source ?? "app",
    grantedAt: now,
    revokedAt: null,
    changedBy: context.changedBy ?? null,
    auditRef: context.auditRef ?? null,
  };
  const saved = store
    ? await store.append(record)
    : await appendDbConsent(record);
  await writeConsentAudit("privacy.consent.granted", saved, context, store);
  return saved;
}

export async function revokeConsent(
  subject: ConsentSubject,
  consentType: PrivacyConsentType,
  context: ConsentActorContext = {},
  store?: InMemoryPrivacyConsentStore
) {
  const now = new Date();
  const record: PrivacyConsentRecord = {
    ...subject,
    consentType,
    status: "revoked",
    source: context.source ?? "app",
    grantedAt: null,
    revokedAt: now,
    changedBy: context.changedBy ?? null,
    auditRef: context.auditRef ?? null,
  };
  const saved = store
    ? await store.append(record)
    : await appendDbConsent(record);
  await writeConsentAudit("privacy.consent.revoked", saved, context, store);
  return saved;
}

export async function getConsentStatus(
  subject: ConsentSubject,
  consentType: PrivacyConsentType,
  store?: InMemoryPrivacyConsentStore
): Promise<PrivacyConsentStatus> {
  const latest = store
    ? await store.latest(subject, consentType)
    : await latestDbConsent(subject, consentType);
  return latest?.status ?? "pending";
}

export async function assertConsentForSensitiveAction(
  subject: ConsentSubject,
  consentType: PrivacyConsentType,
  store?: InMemoryPrivacyConsentStore
) {
  const status = await getConsentStatus(subject, consentType, store);
  if (status !== "granted") throw new ConsentRequiredError(consentType);
  return { consentType, status };
}

export async function getConsentAuditTrail(
  subject: ConsentSubject,
  consentType?: PrivacyConsentType,
  store?: InMemoryPrivacyConsentStore
) {
  return store
    ? store.trail(subject, consentType)
    : trailDbConsent(subject, consentType);
}

export function isReminderOrMarketingAllowed(
  status: PrivacyConsentStatus,
  _purpose:
    | "refill_reminder"
    | "dosage_reminder"
    | "whatsapp_marketing"
    | "sms_marketing"
) {
  return status === "granted";
}

export function isTransactionalNotificationAllowed(
  status: PrivacyConsentStatus,
  _channel: "whatsapp_transactional" | "sms_transactional"
) {
  return status === "granted" || status === "pending";
}

export async function assertFamilyProfileAccessConsent(
  subject: ConsentSubject,
  store?: InMemoryPrivacyConsentStore
) {
  return assertConsentForSensitiveAction(
    subject,
    "family_profile_access",
    store
  );
}
