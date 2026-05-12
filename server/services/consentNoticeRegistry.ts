import { createHash } from "crypto";
import pino from "pino";
import { and, eq, isNull, lte, or, gt } from "drizzle-orm";
import { getDb } from "../db";
import { consentNoticeVersions, privacyConsents } from "../../drizzle/schema";

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });

export type NoticeKind =
  | "privacy_policy"
  | "terms"
  | "rx_data_use"
  | "marketing";

export interface NoticeRecord {
  id: number;
  noticeKind: string;
  version: string;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
  contentHash: string;
  contentText: string;
  language: string;
  publishedByUserId: number;
  createdAt: Date;
}

function hashContent(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export async function publishNotice(input: {
  noticeKind: string;
  version: string;
  effectiveFrom: Date;
  contentText: string;
  language?: string;
  publishedByUserId: number;
}): Promise<{ id: number; contentHash: string }> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable for publishNotice");

  const language = input.language ?? "en";
  const contentHash = hashContent(input.contentText);

  const result = await db.insert(consentNoticeVersions).values({
    noticeKind: input.noticeKind,
    version: input.version,
    effectiveFrom: input.effectiveFrom,
    contentHash,
    contentText: input.contentText,
    language,
    publishedByUserId: input.publishedByUserId,
  });

  const id = Number((result as any).insertId ?? 0);
  logger.info(
    { noticeKind: input.noticeKind, version: input.version, id },
    "consentNoticeRegistry: notice published"
  );
  return { id, contentHash };
}

export async function getActiveNotice(input: {
  noticeKind: string;
  language?: string;
  asOf?: Date;
}): Promise<NoticeRecord | null> {
  const db = await getDb();
  if (!db) return null;

  const asOf = input.asOf ?? new Date();
  const language = input.language ?? "en";

  const rows = await db
    .select()
    .from(consentNoticeVersions)
    .where(
      and(
        eq(consentNoticeVersions.noticeKind, input.noticeKind),
        eq(consentNoticeVersions.language, language),
        lte(consentNoticeVersions.effectiveFrom, asOf),
        or(
          isNull(consentNoticeVersions.effectiveUntil),
          gt(consentNoticeVersions.effectiveUntil, asOf)
        )
      )
    )
    .limit(10);

  if (rows.length === 0) return null;

  // Pick the most recently effective version
  rows.sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime());
  return rows[0] as NoticeRecord;
}

export async function listNoticesForKind(input: {
  noticeKind: string;
  includeExpired?: boolean;
}): Promise<NoticeRecord[]> {
  const db = await getDb();
  if (!db) return [];

  const now = new Date();
  const conditions = [eq(consentNoticeVersions.noticeKind, input.noticeKind)];

  if (!input.includeExpired) {
    conditions.push(
      or(
        isNull(consentNoticeVersions.effectiveUntil),
        gt(consentNoticeVersions.effectiveUntil, now)
      ) as ReturnType<typeof eq>
    );
  }

  const rows = await db
    .select()
    .from(consentNoticeVersions)
    .where(and(...conditions))
    .limit(200);

  return rows as NoticeRecord[];
}

export async function recordUserAcceptance(input: {
  userId: number;
  noticeId: number;
  acceptedAt?: Date;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable for recordUserAcceptance");

  const acceptedAt = input.acceptedAt ?? new Date();

  // Store acceptance in privacy_consents table
  await db.insert(privacyConsents).values({
    userId: input.userId,
    customerId: input.userId,
    consentType: "prescription_storage",
    status: "granted",
    source: "app",
    grantedAt: acceptedAt,
    changedBy: input.userId,
    auditRef: `notice:${input.noticeId}`,
  });

  logger.info(
    { userId: input.userId, noticeId: input.noticeId },
    "consentNoticeRegistry: user acceptance recorded"
  );
}
