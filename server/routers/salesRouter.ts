/**
 * salesRouter.ts — PART 7: Sales + Counter Billing V1
 * Counter billing, FEFO batch selection, Rx gate, payment, returns, stock movements.
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { requireStoreAccess } from "../_core/rbac";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logAudit } from "../services/audit";
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
import { assertConsentForScheduleSale } from "../services/familyConsentService";
import {
  buildIdempotencyKey,
  getRequestIdFromContext,
} from "../services/idempotencyService";
import { getCanonicalAvailability } from "../services/reservationService";
import { buildDraftBillNumber } from "../services/invoiceNumbering";
import { createSaleInvoiceSnapshot } from "../services/invoiceSnapshotService";
import {
  assertRuntimeGate,
  normalizeScheduleCode,
  productToMasterLike,
  validateProductForRegulatedSale,
} from "../services/productMasterValidation";
import { emitSloEvent } from "../services/sloService";
import { executeCommand } from "../services/executeCommand";
import { salesRouterExtension } from "./salesReportsRouter";
import { requireStoreAccessForEntity } from "../_core/storeAccessHelpers";
import { getDbSafe, requireSales } from "./salesUtils";
import { salesOpsExtension } from "./salesOpsExtension";

export const salesRouter = router({
  ...salesOpsExtension,

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
      requireStoreAccess(ctx.user, Number(input.storeId));
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
      await requireStoreAccessForEntity(
        "sale",
        input.saleId as unknown as number,
        ctx
      );
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

      // Family consent gate: under-18 customers require guardian consent for H/H1/X.
      if (
        (scheduleCode === "H" ||
          scheduleCode === "H1" ||
          scheduleCode === "X") &&
        sale.customerId
      ) {
        const customerId = parseInt(sale.customerId, 10);
        if (!isNaN(customerId)) {
          await assertConsentForScheduleSale({
            customerId,
            scheduleClass: scheduleCode,
          });
        }
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
      await requireStoreAccessForEntity(
        "sale",
        input.saleId as unknown as number,
        ctx
      );
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
      const started = Date.now();
      let withinBudget = false;
      try {
        requireSales(ctx.user?.role);
        const result = await executeCommand({
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
                assertDiscountWithinCaps(
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
                (getRequestIdFromContext(ctx) as string | null) ??
                  "no-request-id",
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
                await recordDiscountCodeUsage(
                  applied.codeId,
                  input.saleId,
                  ctx
                );
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
            const r = result as {
              idempotent?: boolean;
              duplicate?: boolean;
              status?: string;
            };
            return {
              output: {
                ok: true,
                billNo: current?.billNo ?? result.billNo,
                total: current?.total ?? sale.total,
                idempotent: r.idempotent,
                duplicate: r.duplicate,
                status: r.status,
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
        withinBudget = Date.now() - started <= 300;
        return result;
      } finally {
        void emitSloEvent({
          sloName: "sale.confirmSale.latency",
          target: 0.95,
          measuredValue: Date.now() - started,
          withinBudget,
          sampleCount: 1,
          windowSeconds: 60,
        });
      }
    }),

  ...salesRouterExtension,
});
