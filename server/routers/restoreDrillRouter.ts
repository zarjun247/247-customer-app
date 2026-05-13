import { z } from "zod";
import { adminProcedure, managerProcedure, router } from "../_core/trpc";
import {
  getLastDrill,
  listDrills,
  getDrillAge,
  recordDrill,
} from "../services/restoreDrillService";

const RestoreDrillRecordSchema = z.object({
  id: z.string().min(1),
  ts: z.string().datetime(),
  actor: z.string().min(1),
  backupFileRef: z.string().min(1),
  outcome: z.enum(["success", "fail", "partial"]),
  durationMs: z.number().int().min(0),
  notes: z.string(),
});

export const restoreDrillRouter = router({
  lastDrill: managerProcedure.query(async () => {
    return getLastDrill();
  }),

  history: managerProcedure
    .input(z.object({ limit: z.number().int().min(1).max(200).default(50) }))
    .query(async ({ input }) => {
      return listDrills(input.limit);
    }),

  drillAge: managerProcedure.query(async () => {
    return getDrillAge();
  }),

  recordDrill: adminProcedure
    .input(RestoreDrillRecordSchema)
    .mutation(async ({ input }) => {
      await recordDrill(input);
      return { success: true, id: input.id };
    }),
});
