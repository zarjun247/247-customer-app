import fs from "fs";
import path from "path";
import pino from "pino";

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

const RESTORE_PATH = path.join(
  process.cwd(),
  "server/data/restore-drills.json"
);

const SLA_HOURS = Number(process.env.BACKUP_DRILL_MIN_INTERVAL_HOURS ?? "168");

export type RestoreDrillRecord = {
  id: string;
  ts: string;
  actor: string;
  backupFileRef: string;
  outcome: "success" | "fail" | "partial";
  durationMs: number;
  notes: string;
};

type RestoreFile = { records: RestoreDrillRecord[] };

function readRestore(): RestoreFile {
  try {
    const raw = fs.readFileSync(RESTORE_PATH, "utf-8");
    return JSON.parse(raw) as RestoreFile;
  } catch {
    return { records: [] };
  }
}

function writeRestore(data: RestoreFile): void {
  const tmp = RESTORE_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmp, RESTORE_PATH);
}

export function listDrills(limit = 50): Promise<RestoreDrillRecord[]> {
  const data = readRestore();
  return Promise.resolve(data.records.slice(-limit).reverse());
}

export function getLastDrill(): Promise<RestoreDrillRecord | null> {
  const data = readRestore();
  if (data.records.length === 0) return Promise.resolve(null);
  return Promise.resolve(data.records[data.records.length - 1]);
}

export async function getDrillAge(): Promise<{
  ageHours: number;
  withinSla: boolean;
} | null> {
  const last = await getLastDrill();
  if (!last) return null;
  const ageHours = (Date.now() - new Date(last.ts).getTime()) / 3_600_000;
  return { ageHours, withinSla: ageHours <= SLA_HOURS };
}

export function recordDrill(input: RestoreDrillRecord): Promise<void> {
  const data = readRestore();
  data.records.push(input);
  writeRestore(data);
  logger.info(
    {
      event: "restore_drill_recorded",
      outcome: input.outcome,
      actor: input.actor,
    },
    "restore_drill_recorded"
  );
  return Promise.resolve();
}
