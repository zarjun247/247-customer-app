/**
 * masterDataPart3Router.ts
 * PART 3 — Master Data Part B + Upgraded Product Master
 * Covers: Doctor (upgraded), PatientCategory, Staff, Store, Building, Printer (upgraded), Product
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { SQL } from "drizzle-orm";
import type { ResultSetHeader } from "mysql2";
import { logAudit } from "../services/audit";
import { router, protectedProcedure } from "../_core/trpc";

export {
  buildingMasterRouter,
  printerMasterRouter,
  productMasterRouter,
} from "./masterDataCatalogExtRouter";

export { storeMasterRouter } from "./masterDataCatalogOpsRouter";

function requireStaff(role: string) {
  const STAFF = [
    "admin",
    "super_admin",
    "store_manager",
    "pharmacist",
    "purchase_manager",
    "accountant",
    "cashier",
    "salesman",
    "inventory_operator",
    "delivery_operator",
    "auditor",
  ];
  if (!STAFF.includes(role))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Staff access required.",
    });
}
function requireManager(role: string) {
  if (
    !["admin", "super_admin", "store_manager", "purchase_manager"].includes(
      role
    )
  )
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Manager access required.",
    });
}
async function getDb() {
  const { getDb: _getDb } = await import("../db");
  const db = await _getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "DB unavailable",
    });
  return db;
}
function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown): string => {
    let s: string;
    if (v === null || v === undefined) {
      s = "";
    } else if (typeof v === "object") {
      s = JSON.stringify(v);
    } else {
      const prim = v as string | number | boolean | bigint;
      s = String(prim);
    }
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  return [
    headers.join(","),
    ...rows.map(r => headers.map(h => esc(r[h])).join(",")),
  ].join("\n");
}

// ─── Doctor Master (upgraded) ─────────────────────────────────────────────────
export const doctorMasterRouter = router({
  /** Returns a paginated, filterable list of doctor records. */
  list: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        activeOnly: z.boolean().default(true),
        limit: z.number().default(200),
        offset: z.number().default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user.role);
      const db = await getDb();
      const { doctors } = await import("../../drizzle/schema");
      const { like, and, eq } = await import("drizzle-orm");
      const conds: SQL<unknown>[] = [];
      if (input.search)
        conds.push(like(doctors.doctorName, `%${input.search}%`));
      if (input.activeOnly) conds.push(eq(doctors.isActive, true));
      const where: SQL<unknown> | undefined = conds.length
        ? and(...conds)
        : undefined;
      const rows = await db
        .select()
        .from(doctors)
        .where(where)
        .orderBy(doctors.doctorName)
        .limit(input.limit)
        .offset(input.offset);
      const [{ total }] = await db
        .select({ total: (await import("drizzle-orm")).count() })
        .from(doctors)
        .where(where);
      return { rows, total };
    }),
  /** Creates a new doctor record and writes an audit log entry. */
  create: protectedProcedure
    .input(
      z.object({
        doctorName: z.string().min(1),
        registrationNo: z.string().optional(),
        clinicHospital: z.string().optional(),
        phone: z.string().optional(),
        address: z.string().optional(),
        specialization: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user.role);
      const db = await getDb();
      const { doctors } = await import("../../drizzle/schema");
      const insertResult = await db.insert(doctors).values(input);
      const id = (insertResult as unknown as [ResultSetHeader])[0].insertId;
      await logAudit({
        actorId: ctx.user.id,
        actorType: "user",
        action: "master.doctor.create",
        entityType: "doctor",
        entityId: id,
        beforeJson: null,
        afterJson: input,
        source: "admin",
      });
      return { id };
    }),
  /** Updates editable fields on an existing doctor record and writes an audit log entry. */
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        doctorName: z.string().optional(),
        registrationNo: z.string().optional(),
        clinicHospital: z.string().optional(),
        phone: z.string().optional(),
        address: z.string().optional(),
        specialization: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user.role);
      const db = await getDb();
      const { doctors } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const { id, ...data } = input;
      const [before] = await db
        .select()
        .from(doctors)
        .where(eq(doctors.id, id));
      await db.update(doctors).set(data).where(eq(doctors.id, id));
      await logAudit({
        actorId: ctx.user.id,
        actorType: "user",
        action: "master.doctor.update",
        entityType: "doctor",
        entityId: id,
        beforeJson: before,
        afterJson: data,
        source: "admin",
      });
      return { success: true };
    }),
  /** Soft-deletes a doctor by setting isActive to false and records the reason in the audit log. */
  deactivate: protectedProcedure
    .input(z.object({ id: z.number(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user.role);
      const db = await getDb();
      const { doctors } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await db
        .update(doctors)
        .set({ isActive: false })
        .where(eq(doctors.id, input.id));
      await logAudit({
        actorId: ctx.user.id,
        actorType: "user",
        action: "master.doctor.deactivate",
        entityType: "doctor",
        entityId: input.id,
        beforeJson: null,
        afterJson: null,
        reason: input.reason,
        source: "admin",
      });
      return { success: true };
    }),
  /** Restores a previously deactivated doctor record by setting isActive to true. */
  reactivate: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user.role);
      const db = await getDb();
      const { doctors } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await db
        .update(doctors)
        .set({ isActive: true })
        .where(eq(doctors.id, input.id));
      await logAudit({
        actorId: ctx.user.id,
        actorType: "user",
        action: "master.doctor.reactivate",
        entityType: "doctor",
        entityId: input.id,
        source: "admin",
      });
      return { success: true };
    }),
  /** Exports the full doctor list as a CSV string, ordered by name. */
  exportCsv: protectedProcedure
    .input(z.object({}))
    .mutation(async ({ ctx }) => {
      requireManager(ctx.user.role);
      const db = await getDb();
      const { doctors } = await import("../../drizzle/schema");
      const rows = await db.select().from(doctors).orderBy(doctors.doctorName);
      return toCsv(rows);
    }),
});

// ─── Patient Category Master ──────────────────────────────────────────────────
export const patientCategoryRouter = router({
  /** Returns all patient category records, optionally filtered by name search or active status. */
  list: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        activeOnly: z.boolean().default(true),
      })
    )
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user.role);
      const db = await getDb();
      const { patientCategories } = await import("../../drizzle/schema");
      const { like, and, eq } = await import("drizzle-orm");
      const conds: SQL<unknown>[] = [];
      if (input.search)
        conds.push(like(patientCategories.categoryName, `%${input.search}%`));
      if (input.activeOnly) conds.push(eq(patientCategories.isActive, true));
      const where: SQL<unknown> | undefined = conds.length
        ? and(...conds)
        : undefined;
      const rows = await db
        .select()
        .from(patientCategories)
        .where(where)
        .orderBy(patientCategories.categoryName);
      return { rows, total: rows.length };
    }),
  /** Creates a new patient category and writes an audit log entry. */
  create: protectedProcedure
    .input(
      z.object({
        categoryName: z.string().min(1),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user.role);
      const db = await getDb();
      const { patientCategories } = await import("../../drizzle/schema");
      const insertResult = await db.insert(patientCategories).values(input);
      const id = (insertResult as unknown as [ResultSetHeader])[0].insertId;
      await logAudit({
        actorId: ctx.user.id,
        actorType: "user",
        action: "master.patient_category.create",
        entityType: "patient_category",
        entityId: id,
        beforeJson: null,
        afterJson: input,
        source: "admin",
      });
      return { id };
    }),
  /** Updates the name or description of an existing patient category and writes an audit log entry. */
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        categoryName: z.string().optional(),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user.role);
      const db = await getDb();
      const { patientCategories } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const { id, ...data } = input;
      const [before] = await db
        .select()
        .from(patientCategories)
        .where(eq(patientCategories.id, id));
      await db
        .update(patientCategories)
        .set(data)
        .where(eq(patientCategories.id, id));
      await logAudit({
        actorId: ctx.user.id,
        actorType: "user",
        action: "master.patient_category.update",
        entityType: "patient_category",
        entityId: id,
        beforeJson: before,
        afterJson: data,
        source: "admin",
      });
      return { success: true };
    }),
  /** Soft-deletes a patient category by setting isActive to false and records the reason in the audit log. */
  deactivate: protectedProcedure
    .input(z.object({ id: z.number(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user.role);
      const db = await getDb();
      const { patientCategories } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await db
        .update(patientCategories)
        .set({ isActive: false })
        .where(eq(patientCategories.id, input.id));
      await logAudit({
        actorId: ctx.user.id,
        actorType: "user",
        action: "master.patient_category.deactivate",
        entityType: "patient_category",
        entityId: input.id,
        beforeJson: null,
        afterJson: null,
        reason: input.reason,
        source: "admin",
      });
      return { success: true };
    }),
  /** Restores a previously deactivated patient category by setting isActive to true. */
  reactivate: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user.role);
      const db = await getDb();
      const { patientCategories } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await db
        .update(patientCategories)
        .set({ isActive: true })
        .where(eq(patientCategories.id, input.id));
      await logAudit({
        actorId: ctx.user.id,
        actorType: "user",
        action: "master.patient_category.reactivate",
        entityType: "patient_category",
        entityId: input.id,
        source: "admin",
      });
      return { success: true };
    }),
});

// ─── Staff Master ─────────────────────────────────────────────────────────────
export const staffMasterRouter = router({
  /** Returns a paginated, filterable list of staff records, optionally scoped to a store or role. */
  list: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        activeOnly: z.boolean().default(true),
        storeId: z.number().optional(),
        role: z.string().optional(),
        limit: z.number().default(200),
        offset: z.number().default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      requireManager(ctx.user.role);
      const db = await getDb();
      const { staffMaster } = await import("../../drizzle/schema");
      const { like, and, eq, or } = await import("drizzle-orm");
      type StaffRoleEnum =
        | "pharmacist"
        | "salesman"
        | "cashier"
        | "store_manager"
        | "purchase_manager"
        | "delivery_rider"
        | "admin"
        | "other";
      const conds: SQL<unknown>[] = [];
      if (input.search)
        conds.push(
          or(
            like(staffMaster.name, `%${input.search}%`),
            like(staffMaster.phone, `%${input.search}%`)
          ) as SQL<unknown>
        );
      if (input.activeOnly) conds.push(eq(staffMaster.isActive, true));
      if (input.storeId) conds.push(eq(staffMaster.storeId, input.storeId));
      if (input.role)
        conds.push(eq(staffMaster.role, input.role as StaffRoleEnum));
      const where: SQL<unknown> | undefined = conds.length
        ? and(...conds)
        : undefined;
      const rows = await db
        .select()
        .from(staffMaster)
        .where(where)
        .orderBy(staffMaster.name)
        .limit(input.limit)
        .offset(input.offset);
      const [{ total }] = await db
        .select({ total: (await import("drizzle-orm")).count() })
        .from(staffMaster)
        .where(where);
      return { rows, total };
    }),
  /** Creates a new staff member record and writes an audit log entry. */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        role: z.enum([
          "pharmacist",
          "salesman",
          "cashier",
          "store_manager",
          "purchase_manager",
          "delivery_rider",
          "admin",
          "other",
        ]),
        salesmanCode: z.string().optional(),
        pharmacistRegistrationNo: z.string().optional(),
        storeId: z.number().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
        loginEnabled: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user.role);
      const db = await getDb();
      const { staffMaster } = await import("../../drizzle/schema");
      const insertResult = await db.insert(staffMaster).values(input);
      const id = (insertResult as unknown as [ResultSetHeader])[0].insertId;
      await logAudit({
        actorId: ctx.user.id,
        actorType: "user",
        action: "master.staff.create",
        entityType: "staff",
        entityId: id,
        beforeJson: null,
        afterJson: input,
        source: "admin",
      });
      return { id };
    }),
  /** Updates editable fields on an existing staff member record and writes an audit log entry. */
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().optional(),
        role: z
          .enum([
            "pharmacist",
            "salesman",
            "cashier",
            "store_manager",
            "purchase_manager",
            "delivery_rider",
            "admin",
            "other",
          ])
          .optional(),
        salesmanCode: z.string().optional(),
        pharmacistRegistrationNo: z.string().optional(),
        storeId: z.number().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
        loginEnabled: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user.role);
      const db = await getDb();
      const { staffMaster } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const { id, ...data } = input;
      const [before] = await db
        .select()
        .from(staffMaster)
        .where(eq(staffMaster.id, id));
      await db.update(staffMaster).set(data).where(eq(staffMaster.id, id));
      await logAudit({
        actorId: ctx.user.id,
        actorType: "user",
        action: "master.staff.update",
        entityType: "staff",
        entityId: id,
        beforeJson: before,
        afterJson: data,
        source: "admin",
      });
      return { success: true };
    }),
  /** Soft-deletes a staff member by setting isActive to false and records the reason in the audit log. */
  deactivate: protectedProcedure
    .input(z.object({ id: z.number(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user.role);
      const db = await getDb();
      const { staffMaster } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await db
        .update(staffMaster)
        .set({ isActive: false })
        .where(eq(staffMaster.id, input.id));
      await logAudit({
        actorId: ctx.user.id,
        actorType: "user",
        action: "master.staff.deactivate",
        entityType: "staff",
        entityId: input.id,
        beforeJson: null,
        afterJson: null,
        reason: input.reason,
        source: "admin",
      });
      return { success: true };
    }),
  /** Restores a previously deactivated staff member by setting isActive to true. */
  reactivate: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user.role);
      const db = await getDb();
      const { staffMaster } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await db
        .update(staffMaster)
        .set({ isActive: true })
        .where(eq(staffMaster.id, input.id));
      await logAudit({
        actorId: ctx.user.id,
        actorType: "user",
        action: "master.staff.reactivate",
        entityType: "staff",
        entityId: input.id,
        source: "admin",
      });
      return { success: true };
    }),
  /** Exports the full staff list as a CSV string, ordered by name. */
  exportCsv: protectedProcedure
    .input(z.object({}))
    .mutation(async ({ ctx }) => {
      requireManager(ctx.user.role);
      const db = await getDb();
      const { staffMaster } = await import("../../drizzle/schema");
      const rows = await db
        .select()
        .from(staffMaster)
        .orderBy(staffMaster.name);
      return toCsv(rows);
    }),
});
