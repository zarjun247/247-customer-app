/**
 * prescriptionGovRouterExtension.ts — second half of prescriptionGovRouter
 * Covers: review, requestClarification, accessLog, h1, gateCheck, archive,
 *         checkRxClearance
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { logAudit } from "../services/audit";
import {
  assertSensitiveActionAllowed as _assertSensitiveActionAllowed,
  requirePermission as _requirePermission,
} from "../services/rbacPolicy";
import {
  encryptPharmacistNote,
  decryptPrescriptionPii,
} from "../services/prescriptionPiiService";
import {
  canUsePrescriptionOnFile,
  isPrescriptionExpired,
  logPrescriptionVaultAccess,
} from "../services/prescriptionVault";
import { eq, and, desc, sql, like, or } from "drizzle-orm";

async function getDbSafe() {
  const { getDb } = await import("../db");
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "DB unavailable",
    });
  return db;
}

function requirePharmacist(role: string | null | undefined) {
  const allowed = ["admin", "super_admin", "pharmacist"];
  if (!role || !allowed.includes(role))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Pharmacist role required",
    });
}

function requireManager(role: string | null | undefined) {
  const allowed = ["admin", "super_admin", "store_manager", "pharmacist"];
  if (!role || !allowed.includes(role))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Manager or pharmacist role required",
    });
}

async function logAccess(
  db: Awaited<ReturnType<typeof getDbSafe>>,
  prescriptionId: number,
  accessedBy: number,
  accessType: "view" | "download" | "print" | "api_check" | "audit",
  purpose: string,
  actorRole: string | null | undefined,
  channel: "admin" | "api" | "app" | "system" | "whatsapp" = "admin"
) {
  await logPrescriptionVaultAccess(db, {
    prescriptionId,
    actorId: accessedBy,
    actorRole: actorRole ?? "staff",
    accessType,
    purpose,
    channel,
  });
}

export const prescriptionGovRouterExtension = {
  // ── Full prescription review (approve/reject entire Rx) ───────────────
  review: protectedProcedure
    .input(
      z.object({
        id: z.number().int(),
        decision: z.enum(["approved", "rejected"]),
        pharmacistNote: z.string().optional(),
        linkedSaleId: z.number().int().optional(),
        linkedOrderId: z.number().int().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requirePharmacist(ctx.user.role);
      const db = await getDbSafe();
      const { prescriptions, prescriptionLines } = await import(
        "../../drizzle/schema"
      );

      const [rx] = await db
        .select()
        .from(prescriptions)
        .where(eq(prescriptions.id, input.id))
        .limit(1);
      if (!rx) throw new TRPCError({ code: "NOT_FOUND" });

      // Update prescription status
      await db
        .update(prescriptions)
        .set({
          status: input.decision,
          pharmacistNote: await encryptPharmacistNote(
            input.pharmacistNote ?? null
          ),
          pharmacistId: ctx.user.id,
          reviewedAt: new Date(),
          linkedSaleId: input.linkedSaleId ?? rx.linkedSaleId,
          linkedOrderId: input.linkedOrderId ?? rx.linkedOrderId,
        })
        .where(eq(prescriptions.id, input.id));

      // If approving, auto-approve all pending lines
      if (input.decision === "approved") {
        await db
          .update(prescriptionLines)
          .set({
            status: "approved",
            reviewedBy: ctx.user.id,
            reviewedAt: new Date(),
          })
          .where(
            and(
              eq(prescriptionLines.prescriptionId, input.id),
              eq(prescriptionLines.status, "pending")
            )
          );
      }

      await logAudit({
        actorId: ctx.user.id,
        action: `prescription.rx_${input.decision}`,
        entityType: "prescription",
        entityId: input.id,
        beforeJson: rx,
        afterJson: { status: input.decision, note: input.pharmacistNote },
        source: "admin",
      });
      await logAccess(
        db,
        input.id,
        ctx.user.id,
        "audit",
        `rx_${input.decision}`,
        ctx.user.role,
        "admin"
      );
      return { success: true };
    }),

  // ── Request clarification ──────────────────────────────────────────────
  requestClarification: protectedProcedure
    .input(
      z.object({
        id: z.number().int(),
        clarificationNote: z.string().min(1, "Clarification note required"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requirePharmacist(ctx.user.role);
      const db = await getDbSafe();
      const { prescriptions } = await import("../../drizzle/schema");

      const [rx] = await db
        .select()
        .from(prescriptions)
        .where(eq(prescriptions.id, input.id))
        .limit(1);
      if (!rx) throw new TRPCError({ code: "NOT_FOUND" });

      await db
        .update(prescriptions)
        .set({
          status: "additional_verification",
          clarificationNote: input.clarificationNote,
          clarificationRequestedAt: new Date(),
          pharmacistId: ctx.user.id,
        })
        .where(eq(prescriptions.id, input.id));

      await logAudit({
        actorId: ctx.user.id,
        action: "prescription.request_clarification",
        entityType: "prescription",
        entityId: input.id,
        beforeJson: rx,
        afterJson: {
          status: "additional_verification",
          note: input.clarificationNote,
        },
        source: "admin",
      });
      return { success: true };
    }),

  // ── Access log ────────────────────────────────────────────────────────
  accessLog: protectedProcedure
    .input(
      z.object({
        prescriptionId: z.number().int(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      requireManager(ctx.user.role);
      const db = await getDbSafe();
      const { prescriptionAccessLog, users } = await import(
        "../../drizzle/schema"
      );

      const offset = (input.page - 1) * input.pageSize;
      const rows = await db
        .select({
          id: prescriptionAccessLog.id,
          prescriptionId: prescriptionAccessLog.prescriptionId,
          accessedBy: prescriptionAccessLog.accessedBy,
          accessType: prescriptionAccessLog.accessType,
          purpose: prescriptionAccessLog.purpose,
          actorId: prescriptionAccessLog.actorId,
          actorRole: prescriptionAccessLog.actorRole,
          channel: prescriptionAccessLog.channel,
          accessedAt: prescriptionAccessLog.accessedAt,
          createdAt: prescriptionAccessLog.createdAt,
          accessorName: users.name,
        })
        .from(prescriptionAccessLog)
        .leftJoin(users, eq(prescriptionAccessLog.accessedBy, users.id))
        .where(eq(prescriptionAccessLog.prescriptionId, input.prescriptionId))
        .orderBy(desc(prescriptionAccessLog.createdAt))
        .limit(input.pageSize)
        .offset(offset);

      return { rows };
    }),

  // ── H1 Register ───────────────────────────────────────────────────────
  h1: router({
    /** Create H1 register entry (required for H1 schedule drugs) */
    create: protectedProcedure
      .input(
        z.object({
          prescriptionId: z.number().int(),
          prescriptionLineId: z.number().int().optional(),
          storeId: z.number().int(),
          patientName: z.string().min(1),
          patientPhone: z.string().optional(),
          prescribingDoctor: z.string().optional(),
          doctorRegNo: z.string().optional(),
          drugName: z.string().min(1),
          productId: z.string().optional(),
          batchNo: z.string().optional(),
          batchLedgerId: z.string().optional(),
          batchId: z.string().optional(),
          qty: z.number().int().positive(),
          billNo: z.string().optional(),
          saleBillNo: z.string().optional(),
          saleId: z.number().int().optional(),
          saleRef: z.string().optional(),
          saleLineRef: z.string().optional(),
          orderId: z.number().int().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requirePharmacist(ctx.user.role);
        if (!input.prescribingDoctor?.trim()) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "Doctor name required before creating final H1 register row",
          });
        }
        const db = await getDbSafe();
        const { h1Register } = await import("../../drizzle/schema");

        const [result] = await db.insert(h1Register).values({
          prescriptionId: input.prescriptionId,
          prescriptionLineId: input.prescriptionLineId ?? null,
          storeId: input.storeId,
          patientName: input.patientName,
          patientPhone: input.patientPhone ?? null,
          prescribingDoctor: input.prescribingDoctor,
          doctorName: input.prescribingDoctor,
          doctorRegNo: input.doctorRegNo ?? null,
          drugName: input.drugName,
          productId: input.productId ?? null,
          batchNo: input.batchNo ?? null,
          batchLedgerId: input.batchLedgerId ?? null,
          batchId: input.batchId ?? input.batchLedgerId ?? null,
          qty: input.qty,
          billNo: input.billNo ?? input.saleBillNo ?? null,
          saleBillNo: input.saleBillNo ?? input.billNo ?? null,
          saleId: input.saleId ?? null,
          saleRef:
            input.saleRef ??
            (input.saleId == null ? null : String(input.saleId)),
          saleLineRef: input.saleLineRef ?? null,
          statutoryContextStatus: "complete",
          pharmacistId: ctx.user.id,
          dispensedAt: new Date(),
        });

        await logAudit({
          actorId: ctx.user.id,
          action: "h1.h1_entry_created",
          entityType: "h1_register",
          entityId: (result as { insertId: number }).insertId,
          beforeJson: null,
          afterJson: input,
          source: "admin",
        });
        return { success: true, id: (result as { insertId: number }).insertId };
      }),

    /** List H1 register entries */
    list: protectedProcedure
      .input(
        z.object({
          storeId: z.number().int().optional(),
          search: z.string().optional(),
          dateFrom: z.string().optional(),
          dateTo: z.string().optional(),
          page: z.number().int().min(1).default(1),
          pageSize: z.number().int().min(1).max(100).default(20),
        })
      )
      .query(async ({ ctx, input }) => {
        requireManager(ctx.user.role);
        const db = await getDbSafe();
        const { h1Register, users } = await import("../../drizzle/schema");

        const offset = (input.page - 1) * input.pageSize;
        const conditions = [];
        if (input.storeId)
          conditions.push(eq(h1Register.storeId, input.storeId));
        if (input.search) {
          conditions.push(
            or(
              like(h1Register.patientName, `%${input.search}%`),
              like(h1Register.drugName, `%${input.search}%`),
              like(h1Register.billNo, `%${input.search}%`)
            )
          );
        }
        if (input.dateFrom)
          conditions.push(
            sql`${h1Register.dispensedAt} >= ${new Date(input.dateFrom)}`
          );
        if (input.dateTo)
          conditions.push(
            sql`${h1Register.dispensedAt} <= ${new Date(input.dateTo)}`
          );

        const where = conditions.length > 0 ? and(...conditions) : undefined;
        const rows = await db
          .select({
            id: h1Register.id,
            prescriptionId: h1Register.prescriptionId,
            storeId: h1Register.storeId,
            patientName: h1Register.patientName,
            patientPhone: h1Register.patientPhone,
            prescribingDoctor: h1Register.prescribingDoctor,
            drugName: h1Register.drugName,
            batchNo: h1Register.batchNo,
            qty: h1Register.qty,
            billNo: h1Register.billNo,
            saleId: h1Register.saleId,
            pharmacistId: h1Register.pharmacistId,
            dispensedAt: h1Register.dispensedAt,
            pharmacistName: users.name,
          })
          .from(h1Register)
          .leftJoin(users, eq(h1Register.pharmacistId, users.id))
          .where(where)
          .orderBy(desc(h1Register.dispensedAt))
          .limit(input.pageSize)
          .offset(offset);

        const [countRow] = await db
          .select({ count: sql<number>`count(*)` })
          .from(h1Register)
          .where(where);

        return { rows, total: Number(countRow?.count ?? 0) };
      }),
  }),

  // ── Gate check (used by checkout and counter billing) ─────────────────
  /** Check if a prescription is approved for a given product. Returns gate status. */
  gateCheck: protectedProcedure
    .input(
      z.object({
        prescriptionId: z.number().int(),
        productId: z.number().int().optional(),
        scheduleCode: z.enum(["OTC", "Rx", "H", "H1", "X", "NRX"]).optional(),
      })
    )
    .query(async ({ input }) => {
      const db = await getDbSafe();
      const { prescriptions, prescriptionLines } = await import(
        "../../drizzle/schema"
      );

      const [rx] = await db
        .select()
        .from(prescriptions)
        .where(eq(prescriptions.id, input.prescriptionId))
        .limit(1);
      if (!rx) return { allowed: false, reason: "Prescription not found" };
      if (rx.status !== "approved" && rx.status !== "on_file")
        return { allowed: false, reason: `Prescription status: ${rx.status}` };
      if (rx.status === "on_file") {
        const usable = canUsePrescriptionOnFile(rx);
        if (!usable.usable) return { allowed: false, reason: usable.reason };
      }

      // Check expiry
      if (isPrescriptionExpired(rx)) {
        return { allowed: false, reason: "Prescription has expired" };
      }

      // Check repeat dispense limit
      if (
        rx.repeatDispenseCount !== null &&
        rx.repeatDispenseMax !== null &&
        rx.repeatDispenseCount >= rx.repeatDispenseMax
      ) {
        return { allowed: false, reason: "Repeat dispense limit reached" };
      }

      // If product specified, check if the line is approved
      if (input.productId) {
        const lines = await db
          .select()
          .from(prescriptionLines)
          .where(
            and(
              eq(prescriptionLines.prescriptionId, input.prescriptionId),
              eq(prescriptionLines.linkedProductId, input.productId)
            )
          )
          .limit(1);

        if (lines.length > 0 && lines[0].status !== "approved") {
          return { allowed: false, reason: `Line status: ${lines[0].status}` };
        }
      }

      // H1 always requires pharmacist at dispense
      if (input.scheduleCode === "H1") {
        return {
          allowed: true,
          requiresH1Register: true,
          reason: "H1 drug: H1 register entry required at dispense",
        };
      }

      return { allowed: true, requiresH1Register: false };
    }),

  // ── Archive (list approved/rejected with filters) ─────────────────────
  archive: protectedProcedure
    .input(
      z.object({
        status: z
          .enum(["approved", "rejected", "on_file", "all"])
          .default("approved"),
        search: z.string().optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      requireManager(ctx.user.role);
      const db = await getDbSafe();
      const { prescriptions, users } = await import("../../drizzle/schema");

      const offset = (input.page - 1) * input.pageSize;
      const conditions = [];
      if (input.status !== "all")
        conditions.push(eq(prescriptions.status, input.status));
      if (input.search) {
        conditions.push(
          or(
            like(prescriptions.patientName, `%${input.search}%`),
            like(prescriptions.doctorName, `%${input.search}%`)
          )
        );
      }
      if (input.dateFrom)
        conditions.push(
          sql`${prescriptions.reviewedAt} >= ${new Date(input.dateFrom)}`
        );
      if (input.dateTo)
        conditions.push(
          sql`${prescriptions.reviewedAt} <= ${new Date(input.dateTo)}`
        );

      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const rows = await db
        .select({
          id: prescriptions.id,
          userId: prescriptions.userId,
          status: prescriptions.status,
          patientName: prescriptions.patientName,
          doctorName: prescriptions.doctorName,
          prescribedDate: prescriptions.prescribedDate,
          reviewedAt: prescriptions.reviewedAt,
          pharmacistNote: prescriptions.pharmacistNote,
          imageUrl: prescriptions.imageUrl,
          linkedSaleId: prescriptions.linkedSaleId,
          linkedOrderId: prescriptions.linkedOrderId,
          createdAt: prescriptions.createdAt,
          userName: users.name,
        })
        .from(prescriptions)
        .leftJoin(users, eq(prescriptions.userId, users.id))
        .where(where)
        .orderBy(desc(prescriptions.reviewedAt))
        .limit(input.pageSize)
        .offset(offset);

      const [countRow] = await db
        .select({ count: sql<number>`count(*)` })
        .from(prescriptions)
        .where(where);

      const decryptedRows = await Promise.all(
        rows.map(r => decryptPrescriptionPii(r))
      );
      return { rows: decryptedRows, total: Number(countRow?.count ?? 0) };
    }),

  /**
   * checkRxClearance — called by counter billing before setting rxCleared:true
   * Verifies a prescription is approved/on-file before dispensing.
   */
  checkRxClearance: protectedProcedure
    .input(
      z.object({
        prescriptionId: z.number().int().optional(),
        scheduleCode: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDbSafe();
      const { prescriptions } = await import("../../drizzle/schema");

      // H1/X always require explicit prescription
      const hardSchedules = ["H1", "X"];
      if (hardSchedules.includes(input.scheduleCode) && !input.prescriptionId) {
        return {
          cleared: false,
          reason: `Schedule ${input.scheduleCode} requires an approved prescription ID`,
        };
      }

      if (!input.prescriptionId) {
        // Rx/H/NRX: allow pharmacist counter override without linking a prescription
        return {
          cleared: true,
          reason: "Pharmacist counter override — no prescription linked",
        };
      }

      const [rx] = await db
        .select({
          id: prescriptions.id,
          status: prescriptions.status,
          userId: prescriptions.userId,
          expiryDate: prescriptions.expiryDate,
          validUntil: prescriptions.validUntil,
          consentRevokedAt: prescriptions.consentRevokedAt,
          repeatDispenseCount: prescriptions.repeatDispenseCount,
          repeatDispenseMax: prescriptions.repeatDispenseMax,
        })
        .from(prescriptions)
        .where(eq(prescriptions.id, input.prescriptionId))
        .limit(1);

      if (!rx) return { cleared: false, reason: "Prescription not found" };
      if (rx.status !== "approved" && rx.status !== "on_file") {
        return {
          cleared: false,
          reason: `Prescription status is '${rx.status}' — must be approved before dispensing`,
        };
      }
      if (rx.status === "on_file") {
        const usable = canUsePrescriptionOnFile(rx);
        if (!usable.usable) return { cleared: false, reason: usable.reason };
      } else if (isPrescriptionExpired(rx)) {
        return { cleared: false, reason: "Prescription has expired" };
      }

      // Log the API check access
      await logAccess(
        db,
        input.prescriptionId,
        ctx.user.id,
        "api_check",
        "counter_billing_rx_gate",
        ctx.user.role,
        "api"
      );
      return { cleared: true, prescriptionId: rx.id };
    }),
};
