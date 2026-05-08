#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = resolve(new URL('..', import.meta.url).pathname);
const files = execFileSync('rg', [
  '--files',
  'server',
  'scripts',
  '--glob',
  '*.ts',
  '--glob',
  '*.tsx',
  '--glob',
  '*.js',
  '--glob',
  '*.mjs',
], { cwd: root, encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter(Boolean);

const hotspotPattern = /\.(where|orderBy|limit)\s*\(|\bfrom\s*\(|\b(report|dashboard|sales|stock|reservation|invoice|refund|h1|supplier|audit)\b/i;
const rows = [];

for (const file of files) {
  const text = readFileSync(resolve(root, file), 'utf8');
  text.split('\n').forEach((line, index) => {
    if (hotspotPattern.test(line)) {
      rows.push({ file: relative(root, resolve(root, file)), line: index + 1, text: line.trim().slice(0, 180) });
    }
  });
}

console.log(JSON.stringify({ generatedAt: new Date().toISOString(), count: rows.length, rows }, null, 2));
