import fs from "fs";
import path from "path";
import pino from "pino";

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

const CHAOS_PATH = path.join(process.cwd(), "server/data/chaos-drills.json");

export type ChaosScenario = {
  name: string;
  description: string;
  dangerLevel: "low" | "medium" | "high";
  requiresEnvFlag: boolean;
};

export const SCENARIOS: readonly ChaosScenario[] = [
  {
    name: "db-pool-exhaust",
    description: "Opens N+1 connections to verify pool exhaustion error handling.",
    dangerLevel: "high",
    requiresEnvFlag: true,
  },
  {
    name: "provider-webhook-fail",
    description: "Posts an intentionally invalid webhook to verify rejection and dead-letter creation.",
    dangerLevel: "low",
    requiresEnvFlag: false,
  },
  {
    name: "slo-budget-breach",
    description: "Emits a synthetic SLO event with withinBudget=false to verify budget tracking.",
    dangerLevel: "low",
    requiresEnvFlag: false,
  },
  {
    name: "dead-letter-injection",
    description: "Creates a synthetic provider_dead_letter row to verify admin UI visibility.",
    dangerLevel: "low",
    requiresEnvFlag: false,
  },
  {
    name: "readiness-fail-injection",
    description: "Writes a fail validation record to verify /healthz reflects it when DEPLOYMENT_VALIDATION_REQUIRED=true.",
    dangerLevel: "medium",
    requiresEnvFlag: false,
  },
  {
    name: "latency-injection",
    description: "Adds artificial latency to a local HTTP endpoint to verify timeout handling.",
    dangerLevel: "low",
    requiresEnvFlag: false,
  },
] as const;

export type ChaosDrillRecord = {
  id: string;
  ts: string;
  actor: string;
  scenario: string;
  outcome: "success" | "fail" | "partial";
  observations: string;
  durationMs: number;
};

type ChaosFile = { records: ChaosDrillRecord[] };

function readChaos(): ChaosFile {
  try {
    const raw = fs.readFileSync(CHAOS_PATH, "utf-8");
    return JSON.parse(raw) as ChaosFile;
  } catch {
    return { records: [] };
  }
}

function writeChaos(data: ChaosFile): void {
  const tmp = CHAOS_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmp, CHAOS_PATH);
}

export function listScenarios(): readonly ChaosScenario[] {
  return SCENARIOS;
}

export async function listDrillRecords(limit = 50): Promise<ChaosDrillRecord[]> {
  const data = readChaos();
  return data.records.slice(-limit).reverse();
}

export async function recordDrill(input: ChaosDrillRecord): Promise<void> {
  const data = readChaos();
  data.records.push(input);
  writeChaos(data);
  logger.info({ event: "chaos_drill_recorded", scenario: input.scenario, outcome: input.outcome }, "chaos_drill_recorded");
}

export function canTrigger(
  scenarioName: string,
  env: string | undefined,
): { allowed: boolean; reason?: string } {
  const scenario = SCENARIOS.find(s => s.name === scenarioName);
  if (!scenario) {
    return { allowed: false, reason: "scenario_not_found" };
  }

  const isProduction = env === "production";
  const chaosDrillEnabled = (process.env.CHAOS_DRILL_ENABLED ?? "").toLowerCase() === "true";

  if (isProduction && !chaosDrillEnabled) {
    return {
      allowed: false,
      reason: "production_requires_CHAOS_DRILL_ENABLED=true",
    };
  }

  return { allowed: true };
}
