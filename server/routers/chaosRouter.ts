import { z } from "zod";
import {
  adminProcedure,
  managerProcedure,
  router,
  capabilityProcedure,
} from "../_core/trpc";
import {
  listScenarios,
  canTrigger,
  listDrillRecords,
  recordDrill,
  type ChaosDrillRecord,
} from "../services/chaosService";

const ChaosDrillRecordSchema = z.object({
  id: z.string().min(1),
  ts: z.string().datetime(),
  actor: z.string().min(1),
  scenario: z.string().min(1),
  outcome: z.enum(["success", "fail", "partial"]),
  observations: z.string(),
  durationMs: z.number().int().min(0),
});

export const chaosRouter = router({
  listScenarios: managerProcedure.query(() => {
    return listScenarios();
  }),

  canTrigger: managerProcedure
    .input(z.object({ scenario: z.string().min(1) }))
    .query(({ input }) => {
      return canTrigger(input.scenario, process.env.NODE_ENV);
    }),

  history: managerProcedure
    .input(z.object({ limit: z.number().int().min(1).max(200).default(50) }))
    .query(async ({ input }) => {
      return listDrillRecords(input.limit);
    }),

  recordDrill: capabilityProcedure("chaos.trigger")
    .input(ChaosDrillRecordSchema)
    .mutation(async ({ input }) => {
      await recordDrill(input);
      return { success: true, id: input.id };
    }),
});
