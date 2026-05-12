import { randomUUID } from "crypto";
import { randomBytes } from "crypto";
import pino from "pino";
import { and, eq, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { dsrRequests } from "../../drizzle/schema/compliance";
import {
  users,
  privacyConsents,
  prescriptions,
  orders,
} from "../../drizzle/schema";
import { logAudit } from "./audit";
import { ENV } from "../_core/env";

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });

const ERASURE_CONFIRMATION_TTL_DAYS = 7;

export type DsrKind =
  | "access"
  | "export"
  | "rectification"
  | "erasure"
  | "consent_log"
  | "grievance";

export type DsrStatus =
  | "pending"
  | "confirmed"
  | "processing"
  | "completed"
  | "rejected"
  | "expired";

function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

// ─── Access ───────────────────────────────────────────────────────────────────

async function assembleAccessPayload(
  customerId: number
): Promise<Record<string, unknown>> {
  const db = await getDb();
  if (!db) return {};

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, customerId))
    .limit(1);
  if (!user) return {};

  const rxRows = await db
    .select()
    .from(prescriptions)
    .where(eq(prescriptions.userId, customerId))
    .limit(100);
  const orderRows = await db
    .select()
    .from(orders)
    .where(eq(orders.userId, customerId))
    .limit(100);
  const consentRows = await db
    .select()
    .from(privacyConsents)
    .where(eq(privacyConsents.customerId, customerId))
    .limit(200);

  return {
    profile: {
      id: user.id,
      name: user.name,
      email: user.email ? "[encrypted]" : null,
      phone: user.phone ? "[encrypted]" : null,
      createdAt: user.createdAt,
    },
    prescriptions: rxRows.map(rx => ({
      id: rx.id,
      status: rx.status,
      createdAt: rx.createdAt,
    })),
    orders: orderRows.map(o => ({
      id: (o as any).id,
      status: (o as any).status,
      createdAt: (o as any).createdAt,
    })),
    consents: consentRows.map(c => ({
      consentType: c.consentType,
      status: c.status,
      grantedAt: c.grantedAt,
      revokedAt: c.revokedAt,
    })),
    exportedAt: new Date().toISOString(),
  };
}

export async function createAccessRequest(input: {
  customerId: number;
}): Promise<{ requestId: string }> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

  const id = randomUUID();
  await db.insert(dsrRequests).values({
    id,
    customerId: input.customerId,
    requestKind: "access",
    requestStatus: "processing",
  });

  const responsePayload = await assembleAccessPayload(input.customerId);

  await db
    .update(dsrRequests)
    .set({
      requestStatus: "completed",
      responsePayload,
      completedAt: new Date(),
    })
    .where(eq(dsrRequests.id, id));

  await logAudit({
    actorId: input.customerId,
    action: "dsr.access.completed",
    entityType: "customer",
    entityId: input.customerId,
    metadata: { requestId: id },
  });

  logger.info(
    { customerId: input.customerId, requestId: id },
    "dsr: access completed"
  );
  return { requestId: id };
}

// ─── Export ───────────────────────────────────────────────────────────────────

export async function createExportRequest(input: {
  customerId: number;
  exportFormat: "json" | "csv";
}): Promise<{ requestId: string }> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

  const id = randomUUID();
  await db.insert(dsrRequests).values({
    id,
    customerId: input.customerId,
    requestKind: "export",
    requestStatus: "processing",
    requestPayload: { format: input.exportFormat },
  });

  const payload = await assembleAccessPayload(input.customerId);
  const bundle =
    input.exportFormat === "csv"
      ? convertToCSVBundle(payload)
      : Buffer.from(JSON.stringify(payload, null, 2)).toString("base64");

  await db
    .update(dsrRequests)
    .set({
      requestStatus: "completed",
      responsePayload: { bundle, format: input.exportFormat },
      completedAt: new Date(),
    })
    .where(eq(dsrRequests.id, id));

  await logAudit({
    actorId: input.customerId,
    action: "dsr.export.completed",
    entityType: "customer",
    entityId: input.customerId,
    metadata: { requestId: id, format: input.exportFormat },
  });

  return { requestId: id };
}

function convertToCSVBundle(payload: Record<string, unknown>): string {
  const lines: string[] = ["section,key,value"];
  for (const [section, value] of Object.entries(payload)) {
    if (typeof value === "object" && value !== null) {
      lines.push(`${section},_object,${JSON.stringify(value)}`);
    } else {
      const prim = value as
        | string
        | number
        | boolean
        | bigint
        | null
        | undefined;
      lines.push(`${section},,${String(prim ?? "")}`);
    }
  }
  return Buffer.from(lines.join("\n")).toString("base64");
}

// ─── Rectification ───────────────────────────────────────────────────────────

export async function createRectificationRequest(input: {
  customerId: number;
  fieldChanges: Array<{
    field: string;
    oldValue: string;
    newValue: string;
    reason: string;
  }>;
}): Promise<{ requestId: string }> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

  const id = randomUUID();
  await db.insert(dsrRequests).values({
    id,
    customerId: input.customerId,
    requestKind: "rectification",
    requestStatus: "pending",
    requestPayload: { fieldChanges: input.fieldChanges },
  });

  await logAudit({
    actorId: input.customerId,
    action: "dsr.rectification.requested",
    entityType: "customer",
    entityId: input.customerId,
    metadata: { requestId: id, fieldCount: input.fieldChanges.length },
  });

  return { requestId: id };
}

// ─── Erasure ──────────────────────────────────────────────────────────────────

export async function createErasureRequest(input: {
  customerId: number;
  scope: "all" | "marketing_only" | "behavioral_only";
}): Promise<{
  requestId: string;
  confirmationToken: string;
  confirmationExpiresAt: Date;
}> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

  const id = randomUUID();
  const confirmationToken = randomToken(32);
  const confirmationExpiresAt = new Date(
    Date.now() + ERASURE_CONFIRMATION_TTL_DAYS * 24 * 60 * 60 * 1000
  );

  await db.insert(dsrRequests).values({
    id,
    customerId: input.customerId,
    requestKind: "erasure",
    requestStatus: "pending",
    requestPayload: { scope: input.scope },
    confirmationToken,
    confirmationExpiresAt,
  });

  await logAudit({
    actorId: input.customerId,
    action: "dsr.erasure.requested",
    entityType: "customer",
    entityId: input.customerId,
    metadata: { requestId: id, scope: input.scope },
  });

  logger.info(
    { customerId: input.customerId, requestId: id, scope: input.scope },
    "dsr: erasure request created, awaiting confirmation"
  );

  return { requestId: id, confirmationToken, confirmationExpiresAt };
}

export async function confirmErasureRequest(input: {
  requestId: string;
  confirmationToken: string;
}): Promise<{ ok: true }> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

  return await db.transaction(async tx => {
    const [req] = await tx
      .select()
      .from(dsrRequests)
      .where(eq(dsrRequests.id, input.requestId))
      .limit(1);

    if (!req) throw new TRPCError({ code: "NOT_FOUND" });

    if (req.requestStatus !== "pending") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Not pending confirmation",
      });
    }

    if (req.confirmationToken !== input.confirmationToken) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    if (req.confirmationExpiresAt && req.confirmationExpiresAt < new Date()) {
      await tx
        .update(dsrRequests)
        .set({ requestStatus: "expired" })
        .where(eq(dsrRequests.id, input.requestId));
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Confirmation window expired",
      });
    }

    await tx
      .update(dsrRequests)
      .set({ requestStatus: "confirmed", confirmedAt: new Date() })
      .where(eq(dsrRequests.id, input.requestId));

    await logAudit({
      actorId: req.customerId,
      action: "dsr.erasure.confirmed",
      entityType: "customer",
      entityId: req.customerId,
      metadata: { requestId: input.requestId },
    });

    logger.info(
      { requestId: input.requestId },
      "dsr: erasure confirmed; retention worker will process"
    );

    return { ok: true as const };
  });
}

// ─── Consent Log ─────────────────────────────────────────────────────────────

export interface ConsentLogEntry {
  consentType: string;
  status: string;
  grantedAt: Date | null;
  revokedAt: Date | null;
}

export async function getConsentLog(input: {
  customerId: number;
}): Promise<{ requestId: string; entries: ConsentLogEntry[] }> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

  const id = randomUUID();
  await db.insert(dsrRequests).values({
    id,
    customerId: input.customerId,
    requestKind: "consent_log",
    requestStatus: "completed",
    completedAt: new Date(),
  });

  const rows = await db
    .select()
    .from(privacyConsents)
    .where(eq(privacyConsents.customerId, input.customerId))
    .limit(500);

  const entries: ConsentLogEntry[] = rows.map(r => ({
    consentType: r.consentType,
    status: r.status,
    grantedAt: r.grantedAt,
    revokedAt: r.revokedAt,
  }));

  return { requestId: id, entries };
}

// ─── Grievance ────────────────────────────────────────────────────────────────

export async function createGrievanceRequest(input: {
  customerId: number;
  grievanceText: string;
  category: string;
}): Promise<{ requestId: string; dpoEmail: string }> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

  const id = randomUUID();
  await db.insert(dsrRequests).values({
    id,
    customerId: input.customerId,
    requestKind: "grievance",
    requestStatus: "pending",
    requestPayload: {
      grievanceText: input.grievanceText,
      category: input.category,
    },
  });

  await logAudit({
    actorId: input.customerId,
    action: "dsr.grievance.submitted",
    entityType: "customer",
    entityId: input.customerId,
    metadata: { requestId: id, category: input.category },
  });

  const dpoEmail = ENV.dpoEmail;
  logger.info(
    { customerId: input.customerId, requestId: id, dpoEmail },
    "dsr: grievance submitted"
  );

  return { requestId: id, dpoEmail };
}

// ─── Status ───────────────────────────────────────────────────────────────────

export async function getDsrStatus(input: {
  requestId: string;
  customerId: number;
}): Promise<typeof dsrRequests.$inferSelect> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

  const [req] = await db
    .select()
    .from(dsrRequests)
    .where(
      and(
        eq(dsrRequests.id, input.requestId),
        eq(dsrRequests.customerId, input.customerId)
      )
    )
    .limit(1);

  if (!req) throw new TRPCError({ code: "NOT_FOUND" });
  return req;
}

// ─── Admin queries ────────────────────────────────────────────────────────────

export async function listDsrRequests(params?: {
  status?: string;
  kind?: string;
  limit?: number;
}): Promise<(typeof dsrRequests.$inferSelect)[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (params?.status)
    conditions.push(eq(dsrRequests.requestStatus, params.status));
  if (params?.kind) conditions.push(eq(dsrRequests.requestKind, params.kind));

  const rows =
    conditions.length > 0
      ? await db
          .select()
          .from(dsrRequests)
          .where(and(...conditions))
          .orderBy(desc(dsrRequests.createdAt))
          .limit(params?.limit ?? 200)
      : await db
          .select()
          .from(dsrRequests)
          .orderBy(desc(dsrRequests.createdAt))
          .limit(params?.limit ?? 200);

  return rows;
}

export async function adminGetDsrRequest(
  requestId: string
): Promise<typeof dsrRequests.$inferSelect | null> {
  const db = await getDb();
  if (!db) return null;

  const [req] = await db
    .select()
    .from(dsrRequests)
    .where(eq(dsrRequests.id, requestId))
    .limit(1);

  return req ?? null;
}

export async function adminApproveRectification(input: {
  requestId: string;
  approvedByUserId: number;
  notes?: string;
}): Promise<{ ok: true }> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

  const [req] = await db
    .select()
    .from(dsrRequests)
    .where(eq(dsrRequests.id, input.requestId))
    .limit(1);

  if (!req) throw new TRPCError({ code: "NOT_FOUND" });
  if (req.requestKind !== "rectification") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Not a rectification request",
    });
  }

  await db
    .update(dsrRequests)
    .set({
      requestStatus: "completed",
      processedByUserId: input.approvedByUserId,
      responsePayload: {
        notes: input.notes ?? null,
        approvedAt: new Date().toISOString(),
      },
      completedAt: new Date(),
    })
    .where(eq(dsrRequests.id, input.requestId));

  await logAudit({
    actorId: input.approvedByUserId,
    action: "dsr.rectification.approved",
    entityType: "dsr_request",
    entityId: req.customerId,
    metadata: { requestId: input.requestId },
  });

  return { ok: true };
}

export async function adminRejectRequest(input: {
  requestId: string;
  rejectedByUserId: number;
  reason: string;
}): Promise<{ ok: true }> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

  const [req] = await db
    .select()
    .from(dsrRequests)
    .where(eq(dsrRequests.id, input.requestId))
    .limit(1);

  if (!req) throw new TRPCError({ code: "NOT_FOUND" });

  await db
    .update(dsrRequests)
    .set({
      requestStatus: "rejected",
      rejectionReason: input.reason,
      processedByUserId: input.rejectedByUserId,
      completedAt: new Date(),
    })
    .where(eq(dsrRequests.id, input.requestId));

  await logAudit({
    actorId: input.rejectedByUserId,
    action: "dsr.request.rejected",
    entityType: "dsr_request",
    entityId: req.customerId,
    reason: input.reason,
    metadata: { requestId: input.requestId },
  });

  return { ok: true };
}
