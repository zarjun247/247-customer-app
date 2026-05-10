import { z } from "zod";
import { router, staffProcedure } from "../_core/trpc";
import {
  getMultiStoreRuntimeOverview,
  getStoreIsolationChecks,
  getStoreRuntimeDetail,
} from "../services/deploymentRuntimeReadiness";

export const multiStoreRuntimeRouter = router({
  overview: staffProcedure.query(() => getMultiStoreRuntimeOverview()),
  isolationChecks: staffProcedure.query(() => getStoreIsolationChecks()),
  store: staffProcedure
    .input(z.object({ storeId: z.number().int().positive() }))
    .query(({ input }) => getStoreRuntimeDetail(input.storeId)),
});
