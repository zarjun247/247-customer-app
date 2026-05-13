#!/usr/bin/env node
/**
 * Lightweight circular import checker for TypeScript source files.
 * Replaces madge when madge is unavailable (e.g. SSL cert environment issues).
 *
 * Usage: node scripts/check-circular.mjs [--root server] [--root client/src]
 * Exit 1 if any cycles found, 0 otherwise.
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { resolve, dirname, relative, extname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

// ─── Config ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const rootArgs = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--root" && args[i + 1]) rootArgs.push(args[++i]);
}
const roots =
  rootArgs.length > 0
    ? rootArgs.map(r => resolve(projectRoot, r))
    : [resolve(projectRoot, "server"), resolve(projectRoot, "client/src")];

const EXTENSIONS = [".ts", ".tsx", ".mts"];
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".next",
  "coverage",
  "__tests__",
]);

// ─── File collection ─────────────────────────────────────────────────────────

function collectFiles(dir, files = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) collectFiles(full, files);
    else if (EXTENSIONS.includes(extname(entry))) files.push(full);
  }
  return files;
}

// ─── Import parsing ──────────────────────────────────────────────────────────

const IMPORT_RE =
  /(?:^|\n)\s*(?:import|export)\s+(?:[^'"]*\s+from\s+)?['"]([^'"]+)['"]/g;

function parseImports(content) {
  const imports = [];
  let m;
  IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(content)) !== null) {
    const spec = m[1];
    if (spec.startsWith(".")) imports.push(spec);
  }
  return imports;
}

function resolveImport(fromFile, spec) {
  const base = resolve(dirname(fromFile), spec);
  // Try exact extensions then index
  for (const ext of EXTENSIONS) {
    const candidate = base + ext;
    try {
      statSync(candidate);
      return candidate;
    } catch {}
  }
  for (const ext of EXTENSIONS) {
    const candidate = join(base, "index" + ext);
    try {
      statSync(candidate);
      return candidate;
    } catch {}
  }
  return null;
}

// ─── Graph building ──────────────────────────────────────────────────────────

const fileSet = new Set();
for (const root of roots) collectFiles(root, []).forEach(f => fileSet.add(f));

const graph = new Map(); // file → Set<file>

for (const file of fileSet) {
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const deps = new Set();
  for (const spec of parseImports(content)) {
    const resolved = resolveImport(file, spec);
    if (resolved && fileSet.has(resolved) && resolved !== file) {
      deps.add(resolved);
    }
  }
  graph.set(file, deps);
}

// ─── Cycle detection (DFS) ───────────────────────────────────────────────────

const COLORS = { WHITE: 0, GRAY: 1, BLACK: 2 };
const color = new Map();
for (const f of fileSet) color.set(f, COLORS.WHITE);

const cycles = [];

function dfs(node, stack) {
  color.set(node, COLORS.GRAY);
  stack.push(node);
  for (const neighbor of graph.get(node) ?? []) {
    if (color.get(neighbor) === COLORS.GRAY) {
      // Found a cycle — extract the cycle portion of the stack
      const cycleStart = stack.indexOf(neighbor);
      cycles.push(stack.slice(cycleStart).concat(neighbor));
    } else if (color.get(neighbor) === COLORS.WHITE) {
      dfs(neighbor, stack);
    }
  }
  stack.pop();
  color.set(node, COLORS.BLACK);
}

for (const node of fileSet) {
  if (color.get(node) === COLORS.WHITE) dfs(node, []);
}

// ─── Report ──────────────────────────────────────────────────────────────────

function rel(f) {
  return relative(projectRoot, f).replace(/\\/g, "/");
}

if (cycles.length === 0) {
  console.log("✓ No circular imports detected.");
  process.exit(0);
} else {
  console.error(`✗ ${cycles.length} circular import cycle(s) found:\n`);
  const seen = new Set();
  let printed = 0;
  for (const cycle of cycles) {
    const key = cycle.map(rel).join(" → ");
    if (seen.has(key)) continue;
    seen.add(key);
    console.error(`  Cycle ${++printed}:`);
    for (const f of cycle) console.error(`    ${rel(f)}`);
    console.error();
  }
  process.exit(1);
}
