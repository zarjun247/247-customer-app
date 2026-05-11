import { z } from "zod";
import { adminProcedure, managerProcedure, router } from "../_core/trpc";
import {
  getCurrentReadiness,
  listReadinessRecords,
  recordReadiness,
  type ReadinessRecord,
} from "../services/deploymentReadinessService";

const CheckResultSchema = z.object({
  name: z.string(),
  status: z.enum(["pass", "fail", "warn", "skipped"]),
  message: z.string().optional(),
  durationMs: z.number().optional(),
});

const ReadinessRecordSchema = z.object({
  id: z.string().min(1),
  ts: z.string().datetime(),
  env: z.enum(["staging", "production"]),
  actor: z.string().min(1),
  commitSha: z.string().min(1),
  checks: z.array(CheckResultSchema),
  overall: z.enum(["pass", "warn", "fail"]),
});

export const deploymentRouter = router({
  readiness: managerProcedure
    .input(z.object({ env: z.enum(["staging", "production"]) }))
    .query(async ({ input }) => {
      return getCurrentReadiness(input.env);
    }),

  history: managerProcedure
    .input(
      z.object({
        env: z.enum(["staging", "production"]).optional(),
        limit: z.number().int().min(1).max(200).default(50),
      }),
    )
    .query(async ({ input }) => {
      const records = await listReadinessRecords(input.limit);
      if (input.env) return records.filter(r => r.env === input.env);
      return records;
    }),

  recordValidation: adminProcedure
    .input(ReadinessRecordSchema)
    .mutation(async ({ input }) => {
      await recordReadiness(input as ReadinessRecord);
      return { success: true, id: input.id };
    }),
});
