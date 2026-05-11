/**
 * salesRouter.ts — PART 7: Sales + Counter Billing V1
 * Counter billing, FEFO batch selection, Rx gate, payment, returns, stock movements.
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { requireStoreAccess } from "../_core/rbac";
import { eq, and, desc, sql, like, or, asc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logAudit } from "../services/audit";
import {
  decreaseStockForSaleConfirmation,
  reverseStockForSaleReturn,
} from "../services/stockInvariant";
import * as commercialTruthSeams from "../services/commercialTruthSeams";
import {
  assertCanConfirmSale,
  createOrVerifyH1RegisterEntry,
} from "../services/complianceGate";
import {
  applyDiscountCode,
  assertDiscountWithinCaps,
  assertNoLossWithoutApproval,
  recordDiscountCodeUsage,
} from "../services/marginGuard";
import {
  resolveBarcodeForSale,
  resolveBarcodeForReturn,
} from "../services/barcodeService";
import {
  buildIdempotencyKey,
  createMutationFingerprint,
  getRequestIdFromContext,
  withIdempotency,
} from "../services/idempotencyService";
import { getCanonicalAvailability } from "../services/reservationService";
import {
  reserveInvoiceNumber,
  generateReturnNoteNumber,
  buildDraftBillNumber,
} from "../services/invoiceNumbering";
import {
  createSaleInvoiceSnapshot,
  getInvoiceSnapshotPackageForSale,
} from "../services/invoiceSnapshotService";
import {
  assertRuntimeGate,
  normalizeScheduleCode,
  productToMasterLike,
  validateProductForRegulatedSale,
} from "../services/productMasterValidation";
import { appendCommercialEventBestEffort } from "../services/commercialLifecycle";
import { executeCommand } from "../services/executeCommand";
import { salesRouterExtension } from "./salesRouterExtension";

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

function requireSales(role: string | null | undefined) {
  const allowed = [
    "admin",
    "super_admin",
    "store_manager",
    "pharmacist",
    "salesman",
    "cashier",
  ];
  if (!role || !allowed.includes(role))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Sales access required",
    });
}

function requireManager(role: string | null | undefined) {
  const allowed = ["admin", "super_admin", "store_manager"];
  if (!role || !allowed.includes(role))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Manager role required",
    });
}

export const salesRouter = router({
  scanBarcodeForSale: protectedProcedure
    .input(z.object({ barcode: z.string().min(1), storeId: z.number() }))
    .query(async ({ ctx, input }) => {
      requireSales(ctx.user?.role);
      if ((input as any).storeId !== undefined)
        requireStoreAccess(ctx.user, Number((input as any).storeId));
      const resolved = await resolveBarcodeForSale(
        input.barcode,
        input.storeId
      );
      return {
        ...resolved,
        stockMutation: "deferred_to_sale_confirmation_stockInvariant",
        complianceGate: "checked_at_confirm",
        marginGuard: "checked_at_confirm",
      };
    }),

  scanBarcodeForReturn: protectedProcedure
    .input(z.object({ barcode: z.string().min(1), storeId: z.number() }))
    .query(async ({ ctx, input }) => {
      requireSales(ctx.user?.role);
      if ((input as any).storeId !== undefined)
        requireStoreAccess(ctx.user, Number((input as any).storeId));
      const resolved = await resolveBarcodeForReturn(
        input.barcode,
        input.storeId
      );
      return {
        ...resolved,
        stockMutation: "deferred_to_return_commit_stockInvariant",
      };
    }),

  // ─── Product Search ──────────────────────────────────────────────────────────
  searchProducts: protectedProcedure
    .input(
      z.object({
        query: z.string().min(1),
        storeId: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      requireSales(ctx.user?.role);
      if ((input as any).storeId !== undefined)
        requireStoreAccess(ctx.user, Number((input as any).storeId));
      const db = await getDbSafe();
      const { products, batchLedger } = await import("../../drizzle/schema");
      const q = `%${input.query}%`;
      const rows = await db
        .select({
          id: products.id,
          name: products.name,
          brand: products.brand,
          strength: products.strength,
          dosageForm: products.form,
          packSize: products.packSize,
          gstRate: products.gstRate,
          hsnCode: products.hsnCode,
          scheduleId: products.schedule,
          prescriptionRequired: products.requiresPrescription,
          h1RegisterRequired: products.requiresPrescription,
          primaryBarcode: products.barcode,
        })
        .from(products)
        .where(
          and(
            or(
              like(products.name, q),
              like(products.brand, q),
              like(products.barcode, q),
              like(products.canonicalName, q)
            )
          )
        )
        .limit(input.limit);
      return { rows };
    }),

  // ─── FEFO Batch Suggestion ───────────────────────────────────────────────────
  getFefoBatches: protectedProcedure
    .input(
      z.object({
        productId: z.string(),
        storeId: z.string(),
        qtyNeeded: z.number().min(1).default(1),
      })
    )
    .query(async ({ ctx, input }) => {
      requireSales(ctx.user?.role);
      if ((input as any).storeId !== undefined)
        requireStoreAccess(ctx.user, Number((input as any).storeId));
      const db = await getDbSafe();
      const { batchLedger } = await import("../../drizzle/schema");
      const now = Date.now();
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      const batches = await db
        .select()
        .from(batchLedger)
        .where(
          and(
            eq(batchLedger.productId, parseInt(input.productId) || 0),
            eq(batchLedger.storeId, parseInt(input.storeId) || 0),
            sql`${batchLedger.qtyOnHand} > 0`,
            sql`${batchLedger.status} NOT IN ('expired','quarantined','disposed','recalled')`
          )
        )
        .orderBy(asc(batchLedger.expiryDate))
        .limit(10);

      return {
        batches: batches.map(b => {
          const expiryMs = b.expiryDate
            ? new Date(b.expiryDate).getTime()
            : null;
          const daysToExpiry = expiryMs
            ? Math.ceil((expiryMs - now) / (24 * 60 * 60 * 1000))
            : null;
          const isNearExpiry = daysToExpiry !== null && daysToExpiry <= 90;
          const isExpired = daysToExpiry !== null && daysToExpiry <= 0;
          const isCritical =
            daysToExpiry !== null && daysToExpiry <= 60 && daysToExpiry > 30;
          const isQuarantineCandidate =
            daysToExpiry !== null && daysToExpiry <= 30 && daysToExpiry > 0;
          return {
            ...b,
            daysToExpiry,
            isNearExpiry,
            isExpired,
            isCritical,
            isQuarantineCandidate,
            availableQty:
              (b.qtyOnHand ?? 0) -
              (b.qtyReserved ?? 0) -
              (b.qtyQuarantined ?? 0) -
              (b.qtyExpired ?? 0),
          };
        }),
      };
    }),

  // ─── Create Draft Sale ───────────────────────────────────────────────────────
  createDraft: protectedProcedure
    .input(
      z.object({
        storeId: z.string(),
        saleType: z
          .enum([
            "counter",
            "medicine",
            "app",
            "whatsapp",
            "phone_assisted",
            "prescription",
            "otc",
            "chronic_refill",
          ])
          .default("counter"),
        customerMobile: z.string().optional(),
        customerName: z.string().optional(),
        salesmanCode: z.string().optional(),
        pharmacistCode: z.string().optional(),
        pharmacistName: z.string().optional(),
        pharmacistRegNo: z.string().optional(),
        discountCode: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireSales(ctx.user?.role);
      if ((input as any).storeId !== undefined)
        requireStoreAccess(ctx.user, Number((input as any).storeId));
      const db = await getDbSafe();
      const { sales } = await import("../../drizzle/schema");
      const now = Date.now();
      const billNo = buildDraftBillNumber(input.storeId);
      const id = randomUUID();
      await db.insert(sales).values({
        id,
        billNo,
        saleType: input.saleType,
        storeId: input.storeId,
        customerMobile: input.customerMobile ?? null,
        customerName: input.customerName ?? null,
        salesmanCode: input.salesmanCode ?? null,
        pharmacistCode: input.pharmacistCode ?? null,
        pharmacistName: input.pharmacistName ?? null,
        pharmacistRegNo: input.pharmacistRegNo ?? null,
        subtotal: "0",
        discountAmount: "0",
        gstAmount: "0",
        total: "0",
        paymentMode: "cash",
        status: "draft",
        billPrinted: 0,
        whatsappSent: 0,
        emailSent: 0,
        createdBy: ctx.user.id.toString(),
        createdAt: now,
        updatedAt: now,
      });
      await logAudit(
        {
          action: "sale.created",
          entityType: "sale",
          entityId: null,
          entityRef: id,
          beforeJson: null,
          afterJson: { billNo, storeId: input.storeId, saleRef: id },
        },
        ctx
      );
      return { id, billNo };
    }),

  // ─── Add Line to Draft ───────────────────────────────────────────────────────
  addLine: protectedProcedure
    .input(
      z.object({
        saleId: z.string(),
        productId: z.string(),
        batchLedgerId: z.string().optional(),
        batchNo: z.string().optional(),
        expiryDate: z.string().optional(),
        mrp: z.number(),
        saleRate: z.number(),
        qty: z.number().min(1),
        discountPct: z.number().min(0).max(100).default(0),
        gstRate: z.number().min(0).default(0),
        hsnCode: z.string().optional(),
        requiresPrescription: z.boolean().default(false),
        scheduleCode: z.string().optional(),
        rxCleared: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireSales(ctx.user?.role);
      if ((input as any).storeId !== undefined)
        requireStoreAccess(ctx.user, Number((input as any).storeId));
      const db = await getDbSafe();
      const { saleLines, sales, products } = await import(
        "../../drizzle/schema"
      );
      const [sale] = await db
        .select()
        .from(sales)
        .where(eq(sales.id, input.saleId))
        .limit(1);
      if (!sale)
        throw new TRPCError({ code: "NOT_FOUND", message: "Sale not found" });
      if (sale.status !== "draft")
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Sale already confirmed",
        });

      const [product] = await db
        .select()
        .from(products)
        .where(eq(products.id, parseInt(input.productId) || 0))
        .limit(1);
      if (!product)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Persisted product metadata is required before adding to bill",
        });
      const persisted = productToMasterLike(product);
      const runtimeGate = validateProductForRegulatedSale(
        persisted,
        undefined,
        { saleType: sale.saleType }
      );
      assertRuntimeGate(
        runtimeGate,
        "Product master is incomplete for statutory sale path"
      );

      // Rx gate: H/H1/X always require pharmacist clearance, using persisted schedule metadata.
      const scheduleCode = normalizeScheduleCode(persisted.schedule);
      const requiresPrescription = Boolean(persisted.requiresPrescription);
      const gstRate = Number(persisted.gstRate ?? input.gstRate);
      const rxSchedules = ["H", "H1", "X", "RX", "NRX"];
      if (rxSchedules.includes(scheduleCode) && !input.rxCleared) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Schedule ${scheduleCode} requires pharmacist clearance before adding to bill`,
        });
      }

      const discountAmount = +(
        input.saleRate *
        input.qty *
        (input.discountPct / 100)
      ).toFixed(2);
      const taxableAmount = +(
        input.saleRate * input.qty -
        discountAmount
      ).toFixed(2);
      const gstAmount = +(taxableAmount * (gstRate / 100)).toFixed(2);
      const lineTotal = +(taxableAmount + gstAmount).toFixed(2);

      const lineId = randomUUID();
      const now = Date.now();
      await db.insert(saleLines).values({
        id: lineId,
        saleId: input.saleId,
        productId: input.productId,
        batchLedgerId: input.batchLedgerId ?? null,
        batchNo: input.batchNo ?? null,
        expiryDate: input.expiryDate ? new Date(input.expiryDate) : null,
        mrp: String(input.mrp),
        saleRate: String(input.saleRate),
        qty: input.qty,
        discountPct: String(input.discountPct),
        discountAmount: String(discountAmount),
        gstRate: String(gstRate),
        gstAmount: String(gstAmount),
        hsnCode: persisted.hsnCode ?? input.hsnCode ?? null,
        lineTotal: String(lineTotal),
        requiresPrescription: requiresPrescription ? 1 : 0,
        scheduleCode,
        rxCleared: input.rxCleared ? 1 : 0,
        createdAt: now,
      });

      // Recalculate sale totals
      const allLines = await db
        .select()
        .from(saleLines)
        .where(eq(saleLines.saleId, input.saleId));
      const subtotal = allLines.reduce(
        (s, l) => s + parseFloat(l.saleRate ?? "0") * l.qty,
        0
      );
      const totalDiscount = allLines.reduce(
        (s, l) => s + parseFloat(l.discountAmount ?? "0"),
        0
      );
      const totalGst = allLines.reduce(
        (s, l) => s + parseFloat(l.gstAmount ?? "0"),
        0
      );
      const total = allLines.reduce(
        (s, l) => s + parseFloat(l.lineTotal ?? "0"),
        0
      );

      await db
        .update(sales)
        .set({
          subtotal: String(+subtotal.toFixed(2)),
          discountAmount: String(+totalDiscount.toFixed(2)),
          gstAmount: String(+totalGst.toFixed(2)),
          total: String(+total.toFixed(2)),
          updatedAt: now,
        })
        .where(eq(sales.id, input.saleId));

      return { lineId, lineTotal };
    }),

  // ─── Remove Line ─────────────────────────────────────────────────────────────
  removeLine: protectedProcedure
    .input(z.object({ saleId: z.string(), lineId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireSales(ctx.user?.role);
      if ((input as any).storeId !== undefined)
        requireStoreAccess(ctx.user, Number((input as any).storeId));
      const db = await getDbSafe();
      const { saleLines, sales } = await import("../../drizzle/schema");
      const [sale] = await db
        .select()
        .from(sales)
        .where(eq(sales.id, input.saleId))
        .limit(1);
      if (!sale || sale.status !== "draft")
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot modify confirmed sale",
        });
      await db
        .delete(saleLines)
        .where(
          and(
            eq(saleLines.id, input.lineId),
            eq(saleLines.saleId, input.saleId)
          )
        );
      const allLines = await db
        .select()
        .from(saleLines)
        .where(eq(saleLines.saleId, input.saleId));
      const subtotal = allLines.reduce(
        (s, l) => s + parseFloat(l.saleRate ?? "0") * l.qty,
        0
      );
      const totalDiscount = allLines.reduce(
        (s, l) => s + parseFloat(l.discountAmount ?? "0"),
        0
      );
      const totalGst = allLines.reduce(
        (s, l) => s + parseFloat(l.gstAmount ?? "0"),
        0
      );
      const total = allLines.reduce(
        (s, l) => s + parseFloat(l.lineTotal ?? "0"),
        0
      );
      await db
        .update(sales)
        .set({
          subtotal: String(+subtotal.toFixed(2)),
          discountAmount: String(+totalDiscount.toFixed(2)),
          gstAmount: String(+totalGst.toFixed(2)),
          total: String(+total.toFixed(2)),
          updatedAt: Date.now(),
        })
        .where(eq(sales.id, input.saleId));
      return { ok: true };
    }),

  // ─── Get Draft (with lines) ──────────────────────────────────────────────────
  getDraft: protectedProcedure
    .input(z.object({ saleId: z.string() }))
    .query(async ({ ctx, input }) => {
      requireSales(ctx.user?.role);
      if ((input as any).storeId !== undefined)
        requireStoreAccess(ctx.user, Number((input as any).storeId));
      const db = await getDbSafe();
      const { sales, saleLines, products } = await import(
        "../../drizzle/schema"
      );
      const [sale] = await db
        .select()
        .from(sales)
        .where(eq(sales.id, input.saleId))
        .limit(1);
      if (!sale) throw new TRPCError({ code: "NOT_FOUND" });
      const lines = await db
        .select({
          line: saleLines,
          productName: products.name,
          productBrand: products.brand,
        })
        .from(saleLines)
        .leftJoin(products, eq(saleLines.productId, products.id))
        .where(eq(saleLines.saleId, input.saleId));
      return { sale, lines };
    }),

  // ─── Confirm Sale (commit stock) ─────────────────────────────────────────────
  confirmSale: protectedProcedure
    .input(
      z.object({
        saleId: z.string(),
        paymentMode: z.enum(["cash", "upi", "card", "credit", "mixed"]),
        paymentRef: z.string().optional(),
        pharmacistCode: z.string().optional(),
        pharmacistName: z.string().optional(),
        pharmacistRegNo: z.string().optional(),
        discountCode: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireSales(ctx.user?.role);
      return executeCommand({
        name: "sale.confirm",
        version: 1,
        idempotencyKey: `sale:confirm:${input.saleId}`,
        input,
        context: {
          actorUserId: ctx.user ? String(ctx.user.id) : null,
          actorRole: ctx.user?.role ?? null,
          storeId: null,
          traceId: null,
        },
        handler: async (_inp, _tx, _commandCtx) => {
          const db = await getDbSafe();
          const { sales, saleLines, products } = await import(
            "../../drizzle/schema"
          );
          const [sale] = await db
            .select()
            .from(sales)
            .where(eq(sales.id, input.saleId))
            .limit(1);
          if (!sale) throw new TRPCError({ code: "NOT_FOUND" });
          if (sale.status !== "confirmed") {
            const lines = await db
              .select()
              .from(saleLines)
              .where(eq(saleLines.saleId, input.saleId));
            if (lines.length === 0)
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "No lines on sale",
              });
            for (const line of lines) {
              const [product] = await db
                .select()
                .from(products)
                .where(eq(products.id, parseInt(line.productId) || 0))
                .limit(1);
              if (!product)
                throw new TRPCError({
                  code: "PRECONDITION_FAILED",
                  message: `Persisted product metadata is required for product ${line.productId}`,
                });
              assertRuntimeGate(
                validateProductForRegulatedSale(
                  productToMasterLike(product),
                  undefined,
                  { saleType: sale.saleType }
                ),
                `Product master is incomplete for product ${line.productId}`
              );
              const availability = await getCanonicalAvailability(
                Number(sale.storeId),
                Number(line.productId),
                null
              );
              if (availability.availableQty < line.qty)
                throw new TRPCError({
                  code: "PRECONDITION_FAILED",
                  message: `Insufficient canonical availability for product ${line.productId}`,
                });
            }
            await assertCanConfirmSale(input.saleId, ctx);
            if (input.discountCode) {
              const applied = await applyDiscountCode(
                input.saleId,
                input.discountCode,
                ctx
              );
              await assertDiscountWithinCaps(
                applied.discountAmount,
                Number(sale.subtotal ?? 0)
              );
            }
            await assertNoLossWithoutApproval(
              input.saleId,
              ctx.user?.role,
              ctx
            );
          }
          // reserveInvoiceNumber(db, sale.storeId, "sale_invoice") is performed by the canonical sale seam.
          const result = await commercialTruthSeams.confirmSaleExactlyOnce({
            saleId: input.saleId,
            idempotencyKey: buildIdempotencyKey([
              "sale",
              "confirm",
              input.saleId,
              getRequestIdFromContext(ctx) ?? "no-request-id",
            ]),
            actorId: ctx.user.id,
            actorRole: ctx.user.role,
            paymentMode: input.paymentMode,
            paymentRef: input.paymentRef ?? null,
          });
          const [current] = await db
            .select()
            .from(sales)
            .where(eq(sales.id, input.saleId))
            .limit(1);
          if (result.confirmed) {
            await createSaleInvoiceSnapshot(db, input.saleId, {
              generatedBy: ctx.user?.id,
            });
            if (input.discountCode) {
              const applied = await applyDiscountCode(
                input.saleId,
                input.discountCode,
                ctx
              );
              await recordDiscountCodeUsage(applied.codeId, input.saleId, ctx);
            }
            await createOrVerifyH1RegisterEntry(
              input.saleId,
              Number(ctx.user?.id ?? 0),
              ctx
            );
            await logAudit(
              {
                action: "sale.confirmed",
                entityType: "sale",
                entityId: null,
                entityRef: input.saleId,
                beforeJson: { status: "draft" },
                afterJson: {
                  status: "confirmed",
                  paymentMode: input.paymentMode,
                },
              },
              ctx
            );
          }
          return {
            output: {
              ok: true,
              billNo: current?.billNo ?? result.billNo,
              total: current?.total ?? sale.total,
              idempotent: (result as any).idempotent,
              duplicate: (result as any).duplicate,
              status: (result as any).status,
            },
            sideEffects: [
              {
                kind: "whatsapp.sale-confirmation",
                payload: { saleId: input.saleId, actorId: ctx.user?.id },
              },
            ],
          };
        },
        sloName: "trpc.sale.confirm.p99",
      });
    }),

  // ─── Immutable invoice snapshot package ─────────────────────────────────────
  getInvoiceSnapshotPackage: protectedProcedure
    .input(z.object({ saleId: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = await getDbSafe();
      try {
        const invoicePackage = await getInvoiceSnapshotPackageForSale(
          db,
          input.saleId,
          { id: ctx.user.id, role: ctx.user?.role }
        );
        if (!invoicePackage)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Invoice snapshot not found",
          });
        return invoicePackage;
      } catch (error) {
        if ((error as any)?.code === "FORBIDDEN")
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Invoice snapshot not available for this customer",
          });
        throw error;
      }
    }),

  ...salesRouterExtension,
});
