#!/usr/bin/env node
/**
 * on-call-rota-validate.mjs
 *
 * Reads rota.yml (NOT templates/rota.yml.example) and validates:
 *   - Every week has at least one primary on-call
 *   - No human in both primary AND secondary in the same week
 *   - Weekend coverage exists
 *   - No more than 14 consecutive days for one human
 *   - Holiday weeks have explicit assignment (not "TBD")
 *
 * If rota.yml doesn't exist: exits 0 with a clear message pointing to the template.
 *
 * Usage:
 *   node scripts/on-call-rota-validate.mjs [--rota <path>] [--help]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
const hasArg = n => args.includes(`--${n}`);
const argVal = (n, fallback = "") => {
  const idx = args.findIndex(a => a === `--${n}` || a.startsWith(`--${n}=`));
  if (idx === -1) return fallback;
  const hit = args[idx];
  return hit.includes("=")
    ? hit.split("=").slice(1).join("=")
    : (args[idx + 1] ?? fallback);
};

if (hasArg("help") || hasArg("h")) {
  console.log(`
on-call-rota-validate.mjs — validate on-call rota coverage

Usage:
  node scripts/on-call-rota-validate.mjs [--rota <path>]

Options:
  --rota <path>   Path to rota.yml (default: rota.yml in repo root)
  --help          Show this help

If rota.yml is not found: exits 0 with instructions to create it from templates/rota.yml.example.
If rota.yml is found: validates all coverage rules and exits non-zero on violations.
`);
  process.exit(0);
}

const ROTA_PATH = argVal("rota", path.join(REPO_ROOT, "rota.yml"));
const TEMPLATE_PATH = path.join(REPO_ROOT, "templates/rota.yml.example");

if (!fs.existsSync(ROTA_PATH)) {
  console.log("[rota-validate] rota.yml not found at:", ROTA_PATH);
  console.log("[rota-validate] This is expected before the rota is set up.");
  console.log("[rota-validate] To create your rota:");
  console.log(`  1. Copy the template: cp ${TEMPLATE_PATH} rota.yml`);
  console.log("  2. Fill in real staff names and dates.");
  console.log(
    "  3. Add rota.yml to .gitignore (do not commit real staff names)."
  );
  console.log("  4. Re-run this script to validate coverage.");
  console.log(
    "[rota-validate] EXIT 0 (rota not yet configured — this is expected before launch)"
  );
  process.exit(0);
}

// Simple YAML parser for our rota schema (no external deps)
function parseSimpleYaml(content) {
  const lines = content.split("\n");
  const result = { weeks: [], holidays_covered: [] };
  let currentWeek = null;
  let inWeeks = false;
  let inHolidays = false;

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith("#") || !line.trim()) continue;

    if (line.trim() === "weeks:") {
      inWeeks = true;
      inHolidays = false;
      continue;
    }
    if (line.trim() === "holidays_covered:") {
      inHolidays = true;
      inWeeks = false;
      continue;
    }

    if (inWeeks) {
      const weekMatch = line.match(/^\s+-\s+week_starting:\s*"?([^"]+)"?/);
      if (weekMatch) {
        currentWeek = {
          week_starting: weekMatch[1].trim(),
          primary: "",
          secondary: "",
          weekend_primary: "",
        };
        result.weeks.push(currentWeek);
        continue;
      }
      if (currentWeek) {
        const primaryMatch = line.match(/^\s+primary:\s*"?([^"]+)"?/);
        if (primaryMatch) {
          currentWeek.primary = primaryMatch[1].trim();
          continue;
        }
        const secondaryMatch = line.match(/^\s+secondary:\s*"?([^"]+)"?/);
        if (secondaryMatch) {
          currentWeek.secondary = secondaryMatch[1].trim();
          continue;
        }
        const weekendMatch = line.match(/^\s+weekend_primary:\s*"?([^"]+)"?/);
        if (weekendMatch) {
          currentWeek.weekend_primary = weekendMatch[1].trim();
          continue;
        }
      }
    }

    if (inHolidays) {
      const holidayMatch = line.match(/^\s+-\s+date:\s*([^\s#]+)/);
      if (holidayMatch) {
        const holiday = { date: holidayMatch[1].trim(), coverage: "" };
        result.holidays_covered.push(holiday);
        continue;
      }
      if (result.holidays_covered.length > 0) {
        const last =
          result.holidays_covered[result.holidays_covered.length - 1];
        const coverageMatch = line.match(/^\s+coverage:\s*"?([^"]+)"?/);
        if (coverageMatch) {
          last.coverage = coverageMatch[1].trim();
        }
      }
    }
  }
  return result;
}

function validate(rota) {
  const errors = [];
  const warnings = [];

  if (!rota.weeks || rota.weeks.length === 0) {
    errors.push("rota.yml has no weeks defined.");
    return { errors, warnings };
  }

  // Track consecutive days per person for 14-day rule
  const personDays = {};

  for (const week of rota.weeks) {
    const weekId = week.week_starting || "(unknown date)";

    // Rule 1: Every week must have a primary
    if (!week.primary || week.primary === "TBD") {
      errors.push(`Week ${weekId}: primary on-call is missing or TBD.`);
    }

    // Rule 2: Primary and secondary must not be the same person
    if (week.primary && week.secondary && week.primary === week.secondary) {
      errors.push(
        `Week ${weekId}: primary and secondary are the same person (${week.primary}).`
      );
    }

    // Rule 3: Weekend coverage must exist
    if (!week.weekend_primary || week.weekend_primary === "TBD") {
      warnings.push(`Week ${weekId}: weekend_primary is missing or TBD.`);
    }

    // Rule 4: Track consecutive days (7 days per week)
    if (week.primary && week.primary !== "TBD") {
      personDays[week.primary] = (personDays[week.primary] || 0) + 7;
      if (personDays[week.primary] > 14) {
        errors.push(
          `${week.primary} has been on-call for more than 14 consecutive days (week ${weekId}).`
        );
      }
    } else {
      // Reset streak if no primary assigned (gap week)
      for (const person of Object.keys(personDays)) {
        personDays[person] = 0;
      }
    }
  }

  // Rule 5: Holiday weeks must have explicit coverage (not TBD)
  for (const holiday of rota.holidays_covered || []) {
    if (!holiday.coverage || holiday.coverage === "TBD") {
      errors.push(
        `Holiday ${holiday.date}: coverage is TBD. Assign explicit on-call for holiday dates.`
      );
    }
  }

  return { errors, warnings };
}

function main() {
  console.log(`[rota-validate] Reading rota.yml from: ${ROTA_PATH}`);
  const content = fs.readFileSync(ROTA_PATH, "utf-8");

  let rota;
  try {
    rota = parseSimpleYaml(content);
  } catch (err) {
    console.error(
      `[rota-validate] ERROR: Could not parse rota.yml: ${err.message}`
    );
    process.exit(1);
  }

  console.log(
    `[rota-validate] Parsed: ${rota.weeks.length} weeks, ${rota.holidays_covered.length} holidays.`
  );

  const { errors, warnings } = validate(rota);

  for (const w of warnings) {
    console.warn(`[rota-validate] WARN: ${w}`);
  }

  if (errors.length > 0) {
    console.error(
      `[rota-validate] FAIL — ${errors.length} validation error(s):`
    );
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  console.log(
    `[rota-validate] PASS — rota.yml is valid (${rota.weeks.length} weeks checked, ${warnings.length} warning(s)).`
  );
  process.exit(0);
}

main();
