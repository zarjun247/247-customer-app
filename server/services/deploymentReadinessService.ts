import fs from "fs";
import path from "path";
import pino from "pino";

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

const VALIDATIONS_PATH = path.join(
  process.cwd(),
  "server/data/deployment-validations.json"
);

export type CheckResult = {
  name: string;
  status: "pass" | "fail" | "warn" | "skipped";
  message?: string;
  durationMs?: number;
};

export type ReadinessRecord = {
  id: string;
  ts: string;
  env: "staging" | "production";
  actor: string;
  commitSha: string;
  checks: CheckResult[];
  overall: "pass" | "warn" | "fail";
};

type ValidationsFile = { records: ReadinessRecord[] };

function readValidations(): ValidationsFile {
  try {
    const raw = fs.readFileSync(VALIDATIONS_PATH, "utf-8");
    return JSON.parse(raw) as ValidationsFile;
  } catch {
    return { records: [] };
  }
}

function writeValidations(data: ValidationsFile): void {
  const tmp = VALIDATIONS_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmp, VALIDATIONS_PATH);
}

export function listReadinessRecords(limit = 50): Promise<ReadinessRecord[]> {
  const data = readValidations();
  return Promise.resolve(data.records.slice(-limit).reverse());
}

export function getCurrentReadiness(env: "staging" | "production"): Promise<{
  status: "ready" | "stale" | "failed" | "unknown";
  lastRecord?: ReadinessRecord;
  ageHours?: number;
}> {
  const data = readValidations();
  const forEnv = data.records.filter(r => r.env === env);
  if (forEnv.length === 0) return Promise.resolve({ status: "unknown" });

  const latest = forEnv[forEnv.length - 1];
  const ageHours = (Date.now() - new Date(latest.ts).getTime()) / 3_600_000;

  if (latest.overall === "fail")
    return Promise.resolve({ status: "failed", lastRecord: latest, ageHours });
  if (ageHours > 24)
    return Promise.resolve({ status: "stale", lastRecord: latest, ageHours });
  return Promise.resolve({ status: "ready", lastRecord: latest, ageHours });
}

export function recordReadiness(input: ReadinessRecord): Promise<void> {
  const data = readValidations();
  data.records.push(input);
  writeValidations(data);
  logger.info(
    {
      event: "deployment_readiness_recorded",
      env: input.env,
      overall: input.overall,
    },
    "deployment_readiness_recorded"
  );
  return Promise.resolve();
}
