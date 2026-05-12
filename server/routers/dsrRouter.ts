import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import * as dsrService from "../services/dsrService";
import { emitSloEvent } from "../services/sloService";

export const dsrRouter = router({
  // Customer requests access to their own data (synchronous)
  access: protectedProcedure.mutation(async ({ ctx }) => {
    const started = Date.now();
    let withinBudget = false;
    try {
      const result = await dsrService.createAccessRequest({
        customerId: ctx.user.id,
      });
      withinBudget = Date.now() - started <= 500;
      return result;
    } finally {
      void emitSloEvent({
        sloName: "dsr.access.latency",
        target: 0.95,
        measuredValue: Date.now() - started,
        withinBudget,
        sampleCount: 1,
        windowSeconds: 60,
      });
    }
  }),

  // Customer requests a downloadable data export
  export: protectedProcedure
    .input(
      z.object({
        format: z.enum(["json", "csv"]).default("json"),
      })
    )
    .mutation(async ({ ctx, input }) =>
      dsrService.createExportRequest({
        customerId: ctx.user.id,
        exportFormat: input.format,
      })
    ),

  // Customer requests correction of their data
  rectification: protectedProcedure
    .input(
      z.object({
        fieldChanges: z
          .array(
            z.object({
              field: z.string().min(1).max(100),
              oldValue: z.string().max(1000),
              newValue: z.string().max(1000),
              reason: z.string().min(5).max(2000),
            })
          )
          .min(1)
          .max(20),
      })
    )
    .mutation(async ({ ctx, input }) =>
      dsrService.createRectificationRequest({
        customerId: ctx.user.id,
        fieldChanges: input.fieldChanges,
      })
    ),

  // Customer requests erasure of their data
  erasure: protectedProcedure
    .input(
      z.object({
        scope: z.enum(["all", "marketing_only", "behavioral_only"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const started = Date.now();
      let withinBudget = false;
      try {
        const result = await dsrService.createErasureRequest({
          customerId: ctx.user.id,
          scope: input.scope,
        });
        withinBudget = Date.now() - started <= 5_000;
        return result;
      } finally {
        void emitSloEvent({
          sloName: "dsr.erasure.latency",
          target: 0.95,
          measuredValue: Date.now() - started,
          withinBudget,
          sampleCount: 1,
          windowSeconds: 60,
        });
      }
    }),

  // Public: customer clicks confirmation link in email (token-based, no session needed)
  confirmErasure: publicProcedure
    .input(
      z.object({
        requestId: z.string().uuid(),
        confirmationToken: z.string().min(10).max(128),
      })
    )
    .mutation(async ({ input }) =>
      dsrService.confirmErasureRequest({
        requestId: input.requestId,
        confirmationToken: input.confirmationToken,
      })
    ),

  // Customer views their consent history
  consentLog: protectedProcedure.query(async ({ ctx }) =>
    dsrService.getConsentLog({ customerId: ctx.user.id })
  ),

  // Customer raises a grievance with the DPO
  grievance: protectedProcedure
    .input(
      z.object({
        grievanceText: z.string().min(10).max(5000),
        category: z.string().min(1).max(100),
      })
    )
    .mutation(async ({ ctx, input }) =>
      dsrService.createGrievanceRequest({
        customerId: ctx.user.id,
        grievanceText: input.grievanceText,
        category: input.category,
      })
    ),

  // Poll status of any DSR request
  status: protectedProcedure
    .input(z.object({ requestId: z.string().uuid() }))
    .query(async ({ ctx, input }) =>
      dsrService.getDsrStatus({
        requestId: input.requestId,
        customerId: ctx.user.id,
      })
    ),
});
