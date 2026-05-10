import { router, staffProcedure } from "../_core/trpc";
import {
  getBackupRestoreDrillReadiness,
  getDeploymentReadinessSummary,
  getDegradedModeStatus,
  getProviderReadiness,
  getWorkerQueueReadiness,
} from "../services/deploymentRuntimeReadiness";
import { getHealthReport, publicLiveness, publicReadiness } from "../services/healthcheck";

export const deploymentReadinessRouter = router({
  liveness: staffProcedure.query(() => publicLiveness()),
  readiness: staffProcedure.query(() => publicReadiness()),
  health: staffProcedure.query(() => getHealthReport()),
  summary: staffProcedure.query(() => getDeploymentReadinessSummary()),
  degradedMode: staffProcedure.query(() => getDegradedModeStatus()),
  providers: staffProcedure.query(() => getProviderReadiness()),
  workerQueue: staffProcedure.query(() => getWorkerQueueReadiness()),
  backupRestoreDrill: staffProcedure.query(() => getBackupRestoreDrillReadiness()),
});
