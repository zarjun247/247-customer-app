import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { and, desc, eq, like } from "drizzle-orm";
import { whatsappLinks, users } from "../../drizzle/schema";
import { upsertWhatsappSession, writeAuditLog } from "../db";
import { getDbSafe } from "./whatsappHelpers";
import { redactSensitive } from "../_core/redact";

export const linkRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        phone: z.string().min(10).max(20),
        userId: z.number().int().positive(),
        method: z
          .enum(["otp", "app_login", "staff_override"])
          .default("staff_override"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDbSafe();
      const existing = await db
        .select()
        .from(whatsappLinks)
        .where(eq(whatsappLinks.phone, input.phone))
        .limit(1);
      if (existing[0]) {
        await db
          .update(whatsappLinks)
          .set({
            userId: input.userId,
            verificationMethod: input.method,
            verifiedAt: new Date(),
            isActive: true,
            linkedBy: ctx.user.id,
          })
          .where(eq(whatsappLinks.phone, input.phone));
      } else {
        await db.insert(whatsappLinks).values({
          phone: input.phone,
          userId: input.userId,
          verificationMethod: input.method,
          verifiedAt: new Date(),
          isActive: true,
          linkedBy: ctx.user.id,
        });
      }
      await upsertWhatsappSession(input.phone, { userId: input.userId });
      await writeAuditLog({
        actor: {
          id: ctx.user.id,
          role: ctx.user.role ?? "staff",
          type: "user",
        },
        action: "whatsapp.link.create",
        entityType: "whatsapp_link",
        payload: JSON.stringify({
          phone: redactSensitive(input.phone), // PII-safe
          userId: input.userId,
          method: input.method,
        }),
      });
      return { ok: true };
    }),

  remove: protectedProcedure
    .input(z.object({ phone: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDbSafe();
      await db
        .update(whatsappLinks)
        .set({ isActive: false })
        .where(eq(whatsappLinks.phone, input.phone));
      await writeAuditLog({
        actor: { id: ctx.user.id, type: "user" },
        action: "whatsapp.link.remove",
        entityType: "whatsapp_link",
        payload: JSON.stringify({ phone: redactSensitive(input.phone) }), // PII-safe
      });
      return { ok: true };
    }),

  list: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(50),
      })
    )
    .query(async ({ input }) => {
      const db = await getDbSafe();
      const offset = (input.page - 1) * input.limit;
      const conditions = [eq(whatsappLinks.isActive, true)];
      if (input.search) {
        conditions.push(like(whatsappLinks.phone, `%${input.search}%`));
      }
      const rows = await db
        .select({
          id: whatsappLinks.id,
          phone: whatsappLinks.phone,
          userId: whatsappLinks.userId,
          verificationMethod: whatsappLinks.verificationMethod,
          verifiedAt: whatsappLinks.verifiedAt,
          userName: users.name,
          userPhone: users.phone,
        })
        .from(whatsappLinks)
        .leftJoin(users, eq(whatsappLinks.userId, users.id))
        .where(and(...conditions))
        .orderBy(desc(whatsappLinks.createdAt))
        .limit(input.limit)
        .offset(offset);
      return { rows };
    }),
});
