import { TRPCError } from "@trpc/server";
import { ENV } from "../_core/env";

export type AppPhase = "pilot" | "scaled" | "full";

const PHASE_ORDER: Record<AppPhase, number> = { pilot: 1, scaled: 2, full: 3 };

export function getCurrentPhase(): AppPhase {
  const raw = ENV.appPhase ?? "pilot";
  if (raw === "pilot" || raw === "scaled" || raw === "full") return raw;
  return "pilot";
}

export function isPhaseAtLeast(required: AppPhase): boolean {
  return PHASE_ORDER[getCurrentPhase()] >= PHASE_ORDER[required];
}

export function assertPhaseAtLeast(
  required: AppPhase,
  featureName: string
): void {
  if (!isPhaseAtLeast(required)) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `Feature "${featureName}" requires APP_PHASE >= "${required}". Current: "${getCurrentPhase()}".`,
    });
  }
}
