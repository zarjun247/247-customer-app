import fs from 'node:fs';
import path, { relative, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);

function collectFiles(dir, exts = ['.ts', '.tsx', '.js', '.mjs']) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) out.push(...collectFiles(full, exts));
    else if (stat.isFile() && exts.includes(path.extname(name))) out.push(path.relative(root, full));
  }
  return out;
}

const files = [
  ...collectFiles(path.join(root, 'server')),
  ...collectFiles(path.join(root, 'scripts')),
];

const hotspotPattern = /\.(where|orderBy|limit)\s*\(|\bfrom\s*\(|\b(report|dashboard|sales|stock|reservation|invoice|refund|h1|supplier|audit)\b/i;
const rows = [];

for (const file of files) {
  try {
    const text = fs.readFileSync(resolve(root, file), 'utf8');
    text.split('\n').forEach((line, index) => {
      if (hotspotPattern.test(line)) {
        rows.push({ file: relative(root, resolve(root, file)), line: index + 1, text: line.trim().slice(0, 180) });
      }
    });
  } catch (e) {
    // ignore
  }
}

console.log(JSON.stringify({ generatedAt: new Date().toISOString(), count: rows.length, rows }, null, 2));
