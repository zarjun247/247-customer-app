/**
 * prescriptionGovRouter.ts — PART 8: Prescription Governance
 * Pharmacist review queue, line-level approve/reject, H1 register,
 * access log, clarification workflow. Hard gate: no Rx/H/H1/X without approval.
 * AI may parse only — no AI approve/reject/substitute.
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { eq, and, desc, sql, like, or, inArray } from "drizzle-orm";

async function getDbSafe() {
  const { getDb } = await import("../db");
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  return db;
}

function requirePharmacist(role: string | null | undefined) {
  const allowed = ["admin", "super_admin", "pharmacist"];
  if (!role || !allowed.includes(role))
    throw new TRPCError({ code: "FORBIDDEN", message: "Pharmacist role required" });
}

function requireManager(role: string | null | undefined) {
  const allowed = ["admin", "super_admin", "store_manager", "pharmacist"];
  if (!role || !allowed.includes(role))
    throw new TRPCError({ code: "FORBIDDEN", message: "Manager or pharmacist role required" });
}

async function writeAuditLog(
  db: Awaited<ReturnType<typeof getDbSafe>>,
  actorId: number,
  action: string,
  entityType: string,
  entityId: string,
  before: unknown,
  after: unknown,
  reason?: string
) {
  const { auditLogs } = await import("../../drizzle/schema");
  await db.insert(auditLogs).values({
    actorId: actorId,
    action,
    entityType,
    entityId: parseInt(entityId) || 0,
    beforeJson: before ? JSON.stringify(before) : null,
    afterJson: after ? JSON.stringify(after) : null,
    reason: reason ?? null,
  });
}

async function logAccess(
  db: Awaited<ReturnType<typeof getDbSafe>>,
  prescriptionId: number,
  accessedBy: number,
  accessType: "view" | "download" | "print" | "api_check" | "audit",
  purpose?: string
) {
  const { prescriptionAccessLog } = await import("../../drizzle/schema");
  await db.insert(prescriptionAccessLog).values({
    prescriptionId,
    accessedBy,
    accessType,
    purpose: purpose ?? null,
  });
}

export const prescriptionGovRouter = router({
  // ── Queue ──────────────────────────────────────────────────────────────────
  /** List pending prescriptions for pharmacist review */
  queue: protectedProcedure
    .input(z.object({
      status: z.enum(["pending_ocr", "pending_pharmacist", "quick_verify", "approved", "rejected",
        "additional_verification", "on_file", "all"]).optional().default("pending_pharmacist"),
      storeId: z.number().int().optional(),
      search: z.string().optional(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      requireManager(ctx.user.role);
      const db = await getDbSafe();
      const { prescriptions, users } = await import("../../drizzle/schema");
      const offset = (input.page - 1) * input.pageSize;

      const conditions = [];
      if (input.status !== "all") conditions.push(eq(prescriptions.status, input.status));
      if (input.storeId) conditions.push(eq(prescriptions.storeId, input.storeId));
      if (input.search) {
        conditions.push(or(
          like(prescriptions.patientName, `%${input.search}%`),
          like(prescriptions.doctorName, `%${input.search}%`),
          like(prescriptions.patientPhone, `%${input.search}%`),
        ));
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
          prescribedDate: prescriptions.prescribedDate,
          expiryDate: prescriptions.expiryDate,
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

      return { rows, total: Number(countRow?.count ?? 0), page: input.page, pageSize: input.pageSize };
    }),

  // ── Get single prescription with lines ────────────────────────────────────
  get: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ ctx, input }) => {
      requireManager(ctx.user.role);
      const db = await getDbSafe();
      const { prescriptions, prescriptionLines, users } = await import("../../drizzle/schema");

      const [rx] = await db
        .select()
        .from(prescriptions)
        .leftJoin(users, eq(prescriptions.userId, users.id))
        .where(eq(prescriptions.id, input.id))
        .limit(1);

      if (!rx) throw new TRPCError({ code: "NOT_FOUND", message: "Prescription not found" });

      const lines = await db
        .select()
        .from(prescriptionLines)
        .where(eq(prescriptionLines.prescriptionId, input.id))
        .orderBy(prescriptionLines.lineNo);

      // Log access
      await logAccess(db, input.id, ctx.user.id as number, "view", "pharmacist_review");

      return { prescription: rx, lines };
    }),

  // ── Update prescription metadata (patient/doctor details) ─────────────────
  updateMetadata: protectedProcedure
    .input(z.object({
      id: z.number().int(),
      patientName: z.string().optional(),
      patientPhone: z.string().optional(),
      patientAddress: z.string().optional(),
      doctorName: z.string().optional(),
      doctorReg: z.string().optional(),
      prescribedDate: z.string().optional(), // ISO date string
      repeatDispenseMax: z.number().int().min(1).max(12).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      requirePharmacist(ctx.user.role);
      const db = await getDbSafe();
      const { prescriptions } = await import("../../drizzle/schema");

      const [before] = await db.select().from(prescriptions).where(eq(prescriptions.id, input.id)).limit(1);
      if (!before) throw new TRPCError({ code: "NOT_FOUND" });

      const updateData: Record<string, unknown> = {};
      if (input.patientName !== undefined) updateData.patientName = input.patientName;
      if (input.patientPhone !== undefined) updateData.patientPhone = input.patientPhone;
      if (input.patientAddress !== undefined) updateData.patientAddress = input.patientAddress;
      if (input.doctorName !== undefined) updateData.doctorName = input.doctorName;
      if (input.doctorReg !== undefined) updateData.doctorReg = input.doctorReg;
      if (input.prescribedDate !== undefined) updateData.prescribedDate = new Date(input.prescribedDate);
      if (input.repeatDispenseMax !== undefined) updateData.repeatDispenseMax = input.repeatDispenseMax;

      await db.update(prescriptions).set(updateData).where(eq(prescriptions.id, input.id));
      await writeAuditLog(db, ctx.user.id as number, "update_metadata", "prescription", String(input.id), before, updateData);
      return { success: true };
    }),

  // ── Add/update prescription lines (OCR-extracted or manual) ───────────────
  upsertLine: protectedProcedure
    .input(z.object({
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
    }))
    .mutation(async ({ ctx, input }) => {
      requirePharmacist(ctx.user.role);
      const db = await getDbSafe();
      const { prescriptionLines } = await import("../../drizzle/schema");

      const { lineId, prescriptionId, ...lineData } = input;
      const requiresH1 = lineData.scheduleCode === "H1" ? 1 : 0;

      if (lineId) {
        await db.update(prescriptionLines)
          .set({ ...lineData, requiresH1 })
          .where(eq(prescriptionLines.id, lineId));
        await writeAuditLog(db, ctx.user.id as number, "update_line", "prescription_line", String(lineId), null, lineData);
        return { success: true, lineId };
      } else {
        const [result] = await db.insert(prescriptionLines).values({
          prescriptionId,
          ...lineData,
          requiresH1,
          status: "pending",
        });
        await writeAuditLog(db, ctx.user.id as number, "add_line", "prescription_line", String((result as { insertId: number }).insertId), null, lineData);
        return { success: true, lineId: (result as { insertId: number }).insertId };
      }
    }),

  // ── Approve individual line ────────────────────────────────────────────────
  approveLine: protectedProcedure
    .input(z.object({
      lineId: z.number().int(),
      pharmacistNote: z.string().optional(),
      linkedProductId: z.number().int().optional(),
      linkedBatchNo: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      requirePharmacist(ctx.user.role);
      const db = await getDbSafe();
      const { prescriptionLines } = await import("../../drizzle/schema");

      const [line] = await db.select().from(prescriptionLines).where(eq(prescriptionLines.id, input.lineId)).limit(1);
      if (!line) throw new TRPCError({ code: "NOT_FOUND", message: "Line not found" });

      await db.update(prescriptionLines).set({
        status: "approved",
        pharmacistNote: input.pharmacistNote ?? null,
        reviewedBy: ctx.user.id as number,
        reviewedAt: new Date(),
        linkedProductId: input.linkedProductId ?? line.linkedProductId,
        linkedBatchNo: input.linkedBatchNo ?? line.linkedBatchNo,
      }).where(eq(prescriptionLines.id, input.lineId));

      await writeAuditLog(db, ctx.user.id as number, "approve_line", "prescription_line", String(input.lineId), line, { status: "approved" });
      return { success: true };
    }),

  // ── Reject individual line ─────────────────────────────────────────────────
  rejectLine: protectedProcedure
    .input(z.object({
      lineId: z.number().int(),
      pharmacistNote: z.string().min(1, "Rejection reason required"),
    }))
    .mutation(async ({ ctx, input }) => {
      requirePharmacist(ctx.user.role);
      const db = await getDbSafe();
      const { prescriptionLines } = await import("../../drizzle/schema");

      const [line] = await db.select().from(prescriptionLines).where(eq(prescriptionLines.id, input.lineId)).limit(1);
      if (!line) throw new TRPCError({ code: "NOT_FOUND" });

      await db.update(prescriptionLines).set({
        status: "rejected",
        pharmacistNote: input.pharmacistNote,
        reviewedBy: ctx.user.id as number,
        reviewedAt: new Date(),
      }).where(eq(prescriptionLines.id, input.lineId));

      await writeAuditLog(db, ctx.user.id as number, "reject_line", "prescription_line", String(input.lineId), line, { status: "rejected", reason: input.pharmacistNote });
      return { success: true };
    }),

  // ── Full prescription review (approve/reject entire Rx) ───────────────────
  review: protectedProcedure
    .input(z.object({
      id: z.number().int(),
      decision: z.enum(["approved", "rejected"]),
      pharmacistNote: z.string().optional(),
      linkedSaleId: z.number().int().optional(),
      linkedOrderId: z.number().int().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      requirePharmacist(ctx.user.role);
      const db = await getDbSafe();
      const { prescriptions, prescriptionLines } = await import("../../drizzle/schema");

      const [rx] = await db.select().from(prescriptions).where(eq(prescriptions.id, input.id)).limit(1);
      if (!rx) throw new TRPCError({ code: "NOT_FOUND" });

      // Update prescription status
      await db.update(prescriptions).set({
        status: input.decision,
        pharmacistNote: input.pharmacistNote ?? null,
        pharmacistId: ctx.user.id as number,
        reviewedAt: new Date(),
        linkedSaleId: input.linkedSaleId ?? rx.linkedSaleId,
        linkedOrderId: input.linkedOrderId ?? rx.linkedOrderId,
      }).where(eq(prescriptions.id, input.id));

      // If approving, auto-approve all pending lines
      if (input.decision === "approved") {
        await db.update(prescriptionLines).set({
          status: "approved",
          reviewedBy: ctx.user.id as number,
          reviewedAt: new Date(),
        }).where(and(
          eq(prescriptionLines.prescriptionId, input.id),
          eq(prescriptionLines.status, "pending"),
        ));
      }

      await writeAuditLog(db, ctx.user.id as number, `rx_${input.decision}`, "prescription", String(input.id), rx, { status: input.decision, note: input.pharmacistNote });
      await logAccess(db, input.id, ctx.user.id as number, "audit", `rx_${input.decision}`);
      return { success: true };
    }),

  // ── Request clarification ──────────────────────────────────────────────────
  requestClarification: protectedProcedure
    .input(z.object({
      id: z.number().int(),
      clarificationNote: z.string().min(1, "Clarification note required"),
    }))
    .mutation(async ({ ctx, input }) => {
      requirePharmacist(ctx.user.role);
      const db = await getDbSafe();
      const { prescriptions } = await import("../../drizzle/schema");

      const [rx] = await db.select().from(prescriptions).where(eq(prescriptions.id, input.id)).limit(1);
      if (!rx) throw new TRPCError({ code: "NOT_FOUND" });

      await db.update(prescriptions).set({
        status: "additional_verification",
        clarificationNote: input.clarificationNote,
        clarificationRequestedAt: new Date(),
        pharmacistId: ctx.user.id as number,
      }).where(eq(prescriptions.id, input.id));

      await writeAuditLog(db, ctx.user.id as number, "request_clarification", "prescription", String(input.id), rx, { status: "additional_verification", note: input.clarificationNote });
      return { success: true };
    }),

  // ── Access log ────────────────────────────────────────────────────────────
  accessLog: protectedProcedure
    .input(z.object({
      prescriptionId: z.number().int(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      requireManager(ctx.user.role);
      const db = await getDbSafe();
      const { prescriptionAccessLog, users } = await import("../../drizzle/schema");

      const offset = (input.page - 1) * input.pageSize;
      const rows = await db
        .select({
          id: prescriptionAccessLog.id,
          prescriptionId: prescriptionAccessLog.prescriptionId,
          accessedBy: prescriptionAccessLog.accessedBy,
          accessType: prescriptionAccessLog.accessType,
          purpose: prescriptionAccessLog.purpose,
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

  // ── H1 Register ───────────────────────────────────────────────────────────
  h1: router({
    /** Create H1 register entry (required for H1 schedule drugs) */
    create: protectedProcedure
      .input(z.object({
        prescriptionId: z.number().int(),
        prescriptionLineId: z.number().int().optional(),
        storeId: z.number().int(),
        patientName: z.string().min(1),
        patientPhone: z.string().optional(),
        prescribingDoctor: z.string().optional(),
        drugName: z.string().min(1),
        batchNo: z.string().optional(),
        qty: z.number().int().positive(),
        billNo: z.string().optional(),
        saleId: z.number().int().optional(),
        orderId: z.number().int().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        requirePharmacist(ctx.user.role);
        const db = await getDbSafe();
        const { h1Register } = await import("../../drizzle/schema");

        const [result] = await db.insert(h1Register).values({
          prescriptionId: input.prescriptionId,
          prescriptionLineId: input.prescriptionLineId ?? null,
          storeId: input.storeId,
          patientName: input.patientName,
          patientPhone: input.patientPhone ?? null,
          prescribingDoctor: input.prescribingDoctor ?? null,
          drugName: input.drugName,
          batchNo: input.batchNo ?? null,
          qty: input.qty,
          billNo: input.billNo ?? null,
          saleId: input.saleId ?? null,
          pharmacistId: ctx.user.id as number,
          dispensedAt: new Date(),
        });

        await writeAuditLog(db, ctx.user.id as number, "h1_entry_created", "h1_register", String((result as { insertId: number }).insertId), null, input);
        return { success: true, id: (result as { insertId: number }).insertId };
      }),

    /** List H1 register entries */
    list: protectedProcedure
      .input(z.object({
        storeId: z.number().int().optional(),
        search: z.string().optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
      }))
      .query(async ({ ctx, input }) => {
        requireManager(ctx.user.role);
        const db = await getDbSafe();
        const { h1Register, users } = await import("../../drizzle/schema");

        const offset = (input.page - 1) * input.pageSize;
        const conditions = [];
        if (input.storeId) conditions.push(eq(h1Register.storeId, input.storeId));
        if (input.search) {
          conditions.push(or(
            like(h1Register.patientName, `%${input.search}%`),
            like(h1Register.drugName, `%${input.search}%`),
            like(h1Register.billNo, `%${input.search}%`),
          ));
        }
        if (input.dateFrom) conditions.push(sql`${h1Register.dispensedAt} >= ${new Date(input.dateFrom)}`);
        if (input.dateTo) conditions.push(sql`${h1Register.dispensedAt} <= ${new Date(input.dateTo)}`);

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

  // ── Gate check (used by checkout and counter billing) ─────────────────────
  /** Check if a prescription is approved for a given product. Returns gate status. */
  gateCheck: protectedProcedure
    .input(z.object({
      prescriptionId: z.number().int(),
      productId: z.number().int().optional(),
      scheduleCode: z.enum(["OTC", "Rx", "H", "H1", "X", "NRX"]).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDbSafe();
      const { prescriptions, prescriptionLines } = await import("../../drizzle/schema");

      const [rx] = await db.select().from(prescriptions).where(eq(prescriptions.id, input.prescriptionId)).limit(1);
      if (!rx) return { allowed: false, reason: "Prescription not found" };
      if (rx.status !== "approved") return { allowed: false, reason: `Prescription status: ${rx.status}` };

      // Check expiry
      if (rx.expiryDate && new Date(rx.expiryDate) < new Date()) {
        return { allowed: false, reason: "Prescription has expired" };
      }

      // Check repeat dispense limit
      if (rx.repeatDispenseCount !== null && rx.repeatDispenseMax !== null &&
          rx.repeatDispenseCount >= rx.repeatDispenseMax) {
        return { allowed: false, reason: "Repeat dispense limit reached" };
      }

      // If product specified, check if the line is approved
      if (input.productId) {
        const lines = await db.select().from(prescriptionLines)
          .where(and(
            eq(prescriptionLines.prescriptionId, input.prescriptionId),
            eq(prescriptionLines.linkedProductId, input.productId),
          )).limit(1);

        if (lines.length > 0 && lines[0].status !== "approved") {
          return { allowed: false, reason: `Line status: ${lines[0].status}` };
        }
      }

      // H1 always requires pharmacist at dispense
      if (input.scheduleCode === "H1") {
        return { allowed: true, requiresH1Register: true, reason: "H1 drug: H1 register entry required at dispense" };
      }

      return { allowed: true, requiresH1Register: false };
    }),

  // ── Archive (list approved/rejected with filters) ─────────────────────────
  archive: protectedProcedure
    .input(z.object({
      status: z.enum(["approved", "rejected", "on_file", "all"]).default("approved"),
      search: z.string().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      requireManager(ctx.user.role);
      const db = await getDbSafe();
      const { prescriptions, users } = await import("../../drizzle/schema");

      const offset = (input.page - 1) * input.pageSize;
      const conditions = [];
      if (input.status !== "all") conditions.push(eq(prescriptions.status, input.status));
      if (input.search) {
        conditions.push(or(
          like(prescriptions.patientName, `%${input.search}%`),
          like(prescriptions.doctorName, `%${input.search}%`),
        ));
      }
      if (input.dateFrom) conditions.push(sql`${prescriptions.reviewedAt} >= ${new Date(input.dateFrom)}`);
      if (input.dateTo) conditions.push(sql`${prescriptions.reviewedAt} <= ${new Date(input.dateTo)}`);

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

      return { rows, total: Number(countRow?.count ?? 0) };
    }),

  /**
   * checkRxClearance — called by counter billing before setting rxCleared:true
   * Verifies a prescription is approved/on-file before dispensing.
   */
  checkRxClearance: protectedProcedure
    .input(z.object({
      prescriptionId: z.number().int().optional(),
      scheduleCode: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDbSafe();
      const { prescriptions } = await import("../../drizzle/schema");

      // H1/X always require explicit prescription
      const hardSchedules = ["H1", "X"];
      if (hardSchedules.includes(input.scheduleCode) && !input.prescriptionId) {
        return { cleared: false, reason: `Schedule ${input.scheduleCode} requires an approved prescription ID` };
      }

      if (!input.prescriptionId) {
        // Rx/H/NRX: allow pharmacist counter override without linking a prescription
        return { cleared: true, reason: "Pharmacist counter override — no prescription linked" };
      }

      const [rx] = await db
        .select({ id: prescriptions.id, status: prescriptions.status })
        .from(prescriptions)
        .where(eq(prescriptions.id, input.prescriptionId))
        .limit(1);

      if (!rx) return { cleared: false, reason: "Prescription not found" };
      if (rx.status !== "approved" && rx.status !== "on_file") {
        return { cleared: false, reason: `Prescription status is '${rx.status}' — must be approved before dispensing` };
      }

      // Log the API check access
      await logAccess(db, input.prescriptionId, ctx.user.id as number, "api_check", "counter_billing_rx_gate");
      return { cleared: true, prescriptionId: rx.id };
    }),
});
