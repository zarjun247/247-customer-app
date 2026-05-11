import { z } from "zod";
import { requireStoreAccess } from "../_core/rbac";
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
    .query(({ ctx, input }) => {
      requireStoreAccess(ctx.user, input.storeId, { allowAdminCrossStore: true });
      return getStoreRuntimeDetail(input.storeId);
    }),
});
