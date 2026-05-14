import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { and, eq } from "drizzle-orm";
import { wabaMessageTemplates } from "../../drizzle/schema";
import type { ResultSetHeader } from "mysql2";
import { getDbSafe, assertWhatsappWebhookGuard } from "./whatsappHelpers";

export const templateRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        category: z.string().optional(),
        isActive: z.boolean().optional(),
      })
    )
    .query(async ({ input }) => {
      const db = await getDbSafe();
      const conditions: ReturnType<typeof eq>[] = [];
      if (input.category)
        conditions.push(
          eq(
            wabaMessageTemplates.category,
            input.category as typeof wabaMessageTemplates.category._.data
          )
        );
      if (input.isActive !== undefined)
        conditions.push(eq(wabaMessageTemplates.isActive, input.isActive));
      return db
        .select()
        .from(wabaMessageTemplates)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(wabaMessageTemplates.category, wabaMessageTemplates.name);
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        category: z.enum([
          "order_status",
          "refill_reminder",
          "rx_received",
          "delivery_otp",
          "bill_share",
          "staff_handoff",
          "delivery_exception",
          "welcome",
          "supplier_bill",
          "custom",
        ]),
        language: z.string().default("en"),
        body: z.string().min(1),
        headerText: z.string().optional(),
        footerText: z.string().optional(),
        buttonLabels: z.array(z.string()).optional(),
        paramCount: z.number().int().min(0).default(0),
        paramDescriptions: z.array(z.string()).optional(),
        wabaTemplateId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDbSafe();
      const templateInsert = await db.insert(wabaMessageTemplates).values({
        name: input.name,
        category: input.category,
        language: input.language,
        body: input.body,
        headerText: input.headerText ?? null,
        footerText: input.footerText ?? null,
        buttonLabels: input.buttonLabels
          ? JSON.stringify(input.buttonLabels)
          : null,
        paramCount: input.paramCount,
        paramDescriptions: input.paramDescriptions
          ? JSON.stringify(input.paramDescriptions)
          : null,
        wabaTemplateId: input.wabaTemplateId ?? null,
        wabaStatus: "draft",
        isActive: true,
        createdBy: ctx.user.id,
      });
      const [templateHeader] = templateInsert as unknown as [ResultSetHeader];
      return { id: templateHeader.insertId };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        body: z.string().optional(),
        headerText: z.string().optional(),
        footerText: z.string().optional(),
        wabaTemplateId: z.string().optional(),
        wabaStatus: z
          .enum(["draft", "pending", "approved", "rejected"])
          .optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      assertWhatsappWebhookGuard(ctx);
      const db = await getDbSafe();
      const update: Partial<{
        body: string;
        headerText: string;
        footerText: string;
        wabaTemplateId: string;
        wabaStatus: "draft" | "pending" | "approved" | "rejected";
        isActive: boolean;
      }> = {};
      if (input.body !== undefined) update.body = input.body;
      if (input.headerText !== undefined) update.headerText = input.headerText;
      if (input.footerText !== undefined) update.footerText = input.footerText;
      if (input.wabaTemplateId !== undefined)
        update.wabaTemplateId = input.wabaTemplateId;
      if (input.wabaStatus !== undefined) update.wabaStatus = input.wabaStatus;
      if (input.isActive !== undefined) update.isActive = input.isActive;
      await db
        .update(wabaMessageTemplates)
        .set(update)
        .where(eq(wabaMessageTemplates.id, input.id));
      return { ok: true };
    }),

  seed: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDbSafe();
    const defaults = [
      {
        name: "order_confirmed",
        category: "order_status" as const,
        body: "✓ Order #{{1}} confirmed!\nTotal: ₹{{2}}\nEstimated delivery: {{3}} mins\n\nTrack: Reply *status {{1}}*",
        paramCount: 3,
        paramDescriptions: JSON.stringify(["orderId", "total", "etaMins"]),
      },
      {
        name: "order_out_for_delivery",
        category: "order_status" as const,
        body: "🛵 Order #{{1}} is out for delivery!\nRider: {{2}}\nOTP: {{3}}\n\nPlease share OTP with rider on delivery.",
        paramCount: 3,
        paramDescriptions: JSON.stringify(["orderId", "riderName", "otp"]),
      },
      {
        name: "order_delivered",
        category: "order_status" as const,
        body: "✓ Order #{{1}} delivered!\nThank you for choosing 24/7 Pharmacy.\n\nReply *hi* to place a new order.",
        paramCount: 1,
        paramDescriptions: JSON.stringify(["orderId"]),
      },
      {
        name: "rx_received",
        category: "rx_received" as const,
        body: "📋 Prescription received!\nOur pharmacist will review it shortly.\n\nRef: RX-{{1}}\n\nReply *hi* for main menu.",
        paramCount: 1,
        paramDescriptions: JSON.stringify(["prescriptionId"]),
      },
      {
        name: "refill_reminder",
        category: "refill_reminder" as const,
        body: "💊 Refill Reminder\n*{{1}}* is due for refill.\n\nReply *reorder* to reorder, or open the 24/7 app.",
        paramCount: 1,
        paramDescriptions: JSON.stringify(["medicineName"]),
      },
      {
        name: "bill_share",
        category: "bill_share" as const,
        body: "🧾 Bill for Order #{{1}}\nTotal: ₹{{2}}\nDate: {{3}}\n\nDownload: {{4}}",
        paramCount: 4,
        paramDescriptions: JSON.stringify([
          "orderId",
          "total",
          "date",
          "invoiceUrl",
        ]),
      },
      {
        name: "staff_handoff",
        category: "staff_handoff" as const,
        body: "👋 You're now connected with our team.\n*{{1}}* will assist you shortly.\n\nRef: #{{2}}",
        paramCount: 2,
        paramDescriptions: JSON.stringify(["staffName", "handoffId"]),
      },
      {
        name: "delivery_exception",
        category: "delivery_exception" as const,
        body: "⚠️ Delivery Update for Order #{{1}}\n{{2}}\n\nOur team will contact you shortly. Reply *help* to connect with staff.",
        paramCount: 2,
        paramDescriptions: JSON.stringify(["orderId", "exceptionMessage"]),
      },
      {
        name: "welcome",
        category: "welcome" as const,
        body: "👋 Welcome to 24/7 Pharmacy!\n\nReply with:\n1️⃣ Search medicines\n2️⃣ My orders\n3️⃣ Upload prescription\n4️⃣ Reorder last order\n5️⃣ Refill reminders\n6️⃣ Talk to staff",
        paramCount: 0,
      },
    ];
    let created = 0;
    for (const t of defaults) {
      try {
        await db.insert(wabaMessageTemplates).values({
          ...t,
          language: "en",
          wabaStatus: "draft",
          isActive: true,
          createdBy: ctx.user.id,
        });
        created++;
      } catch {
        // Skip duplicates
      }
    }
    return { created };
  }),
});
