/**
 * prescriptionGovRouter.ts — PART 8: Prescription Governance
 * Pharmacist review queue, line-level approve/reject, H1 register,
 * access log, clarification workflow. Hard gate: no Rx/H/H1/X without approval.
 * AI may parse only — no AI approve/reject/substitute.
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { logAudit } from "../services/audit";
import {
  assertSensitiveActionAllowed,
  requirePermission,
} from "../services/rbacPolicy";
import {
  canUsePrescriptionOnFile,
  isPrescriptionExpired,
  logPrescriptionVaultAccess,
} from "../services/prescriptionVault";
import { eq, and, desc, sql, like, or, inArray } from "drizzle-orm";
import { prescriptionGovRouterExtension } from "./prescriptionGovRouterExtension";

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

export const prescriptionGovRouter = router({
  // ── Queue ──────────────────────────────────────────────────────────────────
  /** List pending prescriptions for pharmacist review */
  queue: protectedProcedure
    .input(
      z.object({
        status: z
          .enum([
            "pending_ocr",
            "pending_pharmacist",
            "quick_verify",
            "approved",
            "rejected",
            "additional_verification",
            "on_file",
            "all",
          ])
          .optional()
          .default("pending_pharmacist"),
        storeId: z.number().int().optional(),
        search: z.string().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      requirePermission(ctx, "prescription.view");
      await assertSensitiveActionAllowed(ctx, "prescription.vault.access");
      const db = await getDbSafe();
      const { prescriptions, users } = await import("../../drizzle/schema");
      const offset = (input.page - 1) * input.pageSize;

      const conditions = [];
      if (input.status !== "all")
        conditions.push(eq(prescriptions.status, input.status));
      if (input.storeId)
        conditions.push(eq(prescriptions.storeId, input.storeId));
      if (input.search) {
        conditions.push(
          or(
            like(prescriptions.patientName, `%${input.search}%`),
            like(prescriptions.doctorName, `%${input.search}%`),
            like(prescriptions.patientPhone, `%${input.search}%`)
          )
        );
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const rows = await db
        .select({
          id: prescriptions.id,
          userId: prescriptions.userId,
          storeId: prescriptions.storeId,
          imageUrl: prescriptions.imageUrl,
          status: prescriptions.status,
          lane: prescriptions.lane,
          patientName: prescriptions.patientName,
          patientPhone: prescriptions.patientPhone,
          doctorName: prescriptions.doctorName,
          doctorReg: prescriptions.doctorReg,
          doctorRegNo: prescriptions.doctorRegNo,
          clinicName: prescriptions.clinicName,
          prescribedDate: prescriptions.prescribedDate,
          prescriptionDate: prescriptions.prescriptionDate,
          expiryDate: prescriptions.expiryDate,
          validUntil: prescriptions.validUntil,
          source: prescriptions.source,
          consentGivenAt: prescriptions.consentGivenAt,
          consentSource: prescriptions.consentSource,
          consentRevokedAt: prescriptions.consentRevokedAt,
          onFileMarkedBy: prescriptions.onFileMarkedBy,
          onFileMarkedAt: prescriptions.onFileMarkedAt,
          pharmacistNote: prescriptions.pharmacistNote,
          pharmacistId: prescriptions.pharmacistId,
          reviewedAt: prescriptions.reviewedAt,
          clarificationNote: prescriptions.clarificationNote,
          clarificationRequestedAt: prescriptions.clarificationRequestedAt,
          repeatDispenseCount: prescriptions.repeatDispenseCount,
          repeatDispenseMax: prescriptions.repeatDispenseMax,
          linkedSaleId: prescriptions.linkedSaleId,
          linkedOrderId: prescriptions.linkedOrderId,
          createdAt: prescriptions.createdAt,
          updatedAt: prescriptions.updatedAt,
          userName: users.name,
          userPhone: users.phone,
        })
        .from(prescriptions)
        .leftJoin(users, eq(prescriptions.userId, users.id))
        .where(where)
        .orderBy(desc(prescriptions.createdAt))
        .limit(input.pageSize)
        .offset(offset);

      const [countRow] = await db
        .select({ count: sql<number>`count(*)` })
        .from(prescriptions)
        .where(where);

      return {
        rows,
        total: Number(countRow?.count ?? 0),
        page: input.page,
        pageSize: input.pageSize,
      };
    }),

  // ── Get single prescription with lines ────────────────────────────────────
  get: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ ctx, input }) => {
      requirePermission(ctx, "prescription.view");
      await assertSensitiveActionAllowed(ctx, "prescription.vault.access");
      const db = await getDbSafe();
      const { prescriptions, prescriptionLines, users } = await import(
        "../../drizzle/schema"
      );

      const [rx] = await db
        .select()
        .from(prescriptions)
        .leftJoin(users, eq(prescriptions.userId, users.id))
        .where(eq(prescriptions.id, input.id))
        .limit(1);

      if (!rx)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Prescription not found",
        });

      const lines = await db
        .select()
        .from(prescriptionLines)
        .where(eq(prescriptionLines.prescriptionId, input.id))
        .orderBy(prescriptionLines.lineNo);

      // Log access
      await logAccess(
        db,
        input.id,
        ctx.user.id,
        "view",
        "pharmacist_review",
        ctx.user.role,
        "admin"
      );

      return { prescription: rx, lines };
    }),

  // ── Update prescription metadata (patient/doctor details) ─────────────────
  updateMetadata: protectedProcedure
    .input(
      z.object({
        id: z.number().int(),
        patientName: z.string().optional(),
        patientPhone: z.string().optional(),
        patientAddress: z.string().optional(),
        doctorName: z.string().optional(),
        doctorReg: z.string().optional(),
        doctorRegNo: z.string().optional(),
        clinicName: z.string().optional(),
        prescribedDate: z.string().optional(), // ISO date string
        prescriptionDate: z.string().optional(),
        expiryDate: z.string().optional(),
        validUntil: z.string().optional(),
        linkedProductIds: z
          .array(z.number().int().positive())
          .max(50)
          .optional(),
        source: z
          .enum(["upload", "whatsapp", "doctor", "pharmacist", "manual"])
          .optional(),
        repeatDispenseMax: z.number().int().min(1).max(12).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requirePermission(ctx, "prescription.review");
      await assertSensitiveActionAllowed(ctx, "prescription.review");
      const db = await getDbSafe();
      const { prescriptions } = await import("../../drizzle/schema");

      const [before] = await db
        .select()
        .from(prescriptions)
        .where(eq(prescriptions.id, input.id))
        .limit(1);
      if (!before) throw new TRPCError({ code: "NOT_FOUND" });

      const updateData: Record<string, unknown> = {};
      if (input.patientName !== undefined)
        updateData.patientName = input.patientName;
      if (input.patientPhone !== undefined)
        updateData.patientPhone = input.patientPhone;
      if (input.patientAddress !== undefined)
        updateData.patientAddress = input.patientAddress;
      if (input.doctorName !== undefined)
        updateData.doctorName = input.doctorName;
      if (input.doctorReg !== undefined) updateData.doctorReg = input.doctorReg;
      if (input.doctorRegNo !== undefined) {
        updateData.doctorRegNo = input.doctorRegNo;
        updateData.doctorReg = input.doctorRegNo;
      }
      if (input.clinicName !== undefined)
        updateData.clinicName = input.clinicName;
      if (input.prescribedDate !== undefined)
        updateData.prescribedDate = new Date(input.prescribedDate);
      if (input.prescriptionDate !== undefined) {
        updateData.prescriptionDate = new Date(input.prescriptionDate);
        updateData.prescribedDate = new Date(input.prescriptionDate);
      }
      if (input.expiryDate !== undefined)
        updateData.expiryDate = new Date(input.expiryDate);
      if (input.validUntil !== undefined) {
        updateData.validUntil = new Date(input.validUntil);
        updateData.expiryDate = new Date(input.validUntil);
      }
      if (input.linkedProductIds !== undefined)
        updateData.linkedProductIds = JSON.stringify(input.linkedProductIds);
      if (input.source !== undefined) updateData.source = input.source;
      if (input.repeatDispenseMax !== undefined)
        updateData.repeatDispenseMax = input.repeatDispenseMax;

      await db
        .update(prescriptions)
        .set(updateData)
        .where(eq(prescriptions.id, input.id));
      await logAudit({
        actorId: ctx.user.id,
        action: "prescription.update_metadata",
        entityType: "prescription",
        entityId: input.id,
        beforeJson: before,
        afterJson: updateData,
        source: "admin",
      });
      return { success: true };
    }),

  // ── Add/update prescription lines (OCR-extracted or manual) ───────────────
  upsertLine: protectedProcedure
    .input(
      z.object({
        prescriptionId: z.number().int(),
        lineId: z.number().int().optional(), // if editing existing
        lineNo: z.number().int().min(1),
        drugName: z.string().min(1),
        genericName: z.string().optional(),
        strength: z.string().optional(),
        dosageForm: z.string().optional(),
        qty: z.number().int().positive().optional(),
        duration: z.string().optional(),
        frequency: z.string().optional(),
        instructions: z.string().optional(),
        scheduleCode: z.enum(["OTC", "Rx", "H", "H1", "X", "NRX"]).optional(),
        linkedProductId: z.number().int().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requirePermission(ctx, "prescription.review");
      await assertSensitiveActionAllowed(ctx, "prescription.review");
      const db = await getDbSafe();
      const { prescriptionLines } = await import("../../drizzle/schema");

      const { lineId, prescriptionId, ...lineData } = input;
      const requiresH1 = lineData.scheduleCode === "H1" ? 1 : 0;

      if (lineId) {
        await db
          .update(prescriptionLines)
          .set({ ...lineData, requiresH1 })
          .where(eq(prescriptionLines.id, lineId));
        await logAudit({
          actorId: ctx.user.id,
          action: "prescription.update_line",
          entityType: "prescription_line",
          entityId: lineId,
          beforeJson: null,
          afterJson: lineData,
          source: "admin",
        });
        return { success: true, lineId };
      } else {
        const [result] = await db.insert(prescriptionLines).values({
          prescriptionId,
          ...lineData,
          requiresH1,
          status: "pending",
        });
        await logAudit({
          actorId: ctx.user.id,
          action: "prescription.add_line",
          entityType: "prescription_line",
          entityId: (result as { insertId: number }).insertId,
          beforeJson: null,
          afterJson: lineData,
          source: "admin",
        });
        return {
          success: true,
          lineId: (result as { insertId: number }).insertId,
        };
      }
    }),

  // ── Approve individual line ────────────────────────────────────────────────
  approveLine: protectedProcedure
    .input(
      z.object({
        lineId: z.number().int(),
        pharmacistNote: z.string().optional(),
        linkedProductId: z.number().int().optional(),
        linkedBatchNo: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requirePermission(ctx, "regulated.release.approve");
      await assertSensitiveActionAllowed(ctx, "regulated.release.approve");
      const db = await getDbSafe();
      const { prescriptionLines } = await import("../../drizzle/schema");

      const [line] = await db
        .select()
        .from(prescriptionLines)
        .where(eq(prescriptionLines.id, input.lineId))
        .limit(1);
      if (!line)
        throw new TRPCError({ code: "NOT_FOUND", message: "Line not found" });

      await db
        .update(prescriptionLines)
        .set({
          status: "approved",
          pharmacistNote: input.pharmacistNote ?? null,
          reviewedBy: ctx.user.id,
          reviewedAt: new Date(),
          linkedProductId: input.linkedProductId ?? line.linkedProductId,
          linkedBatchNo: input.linkedBatchNo ?? line.linkedBatchNo,
        })
        .where(eq(prescriptionLines.id, input.lineId));

      await logAudit({
        actorId: ctx.user.id,
        action: "prescription.approve_line",
        entityType: "prescription_line",
        entityId: input.lineId,
        beforeJson: line,
        afterJson: { status: "approved" },
        source: "admin",
      });
      return { success: true };
    }),

  // ── Reject individual line ─────────────────────────────────────────────────
  rejectLine: protectedProcedure
    .input(
      z.object({
        lineId: z.number().int(),
        pharmacistNote: z.string().min(1, "Rejection reason required"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requirePharmacist(ctx.user.role);
      const db = await getDbSafe();
      const { prescriptionLines } = await import("../../drizzle/schema");

      const [line] = await db
        .select()
        .from(prescriptionLines)
        .where(eq(prescriptionLines.id, input.lineId))
        .limit(1);
      if (!line) throw new TRPCError({ code: "NOT_FOUND" });

      await db
        .update(prescriptionLines)
        .set({
          status: "rejected",
          pharmacistNote: input.pharmacistNote,
          reviewedBy: ctx.user.id,
          reviewedAt: new Date(),
        })
        .where(eq(prescriptionLines.id, input.lineId));

      await logAudit({
        actorId: ctx.user.id,
        action: "prescription.reject_line",
        entityType: "prescription_line",
        entityId: input.lineId,
        beforeJson: line,
        afterJson: { status: "rejected", reason: input.pharmacistNote },
        source: "admin",
      });
      return { success: true };
    }),

  ...prescriptionGovRouterExtension,
});
