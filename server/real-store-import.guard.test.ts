import { describe, it, expect } from 'vitest';
import fs from 'fs';

describe('real store import planning guards', () => {
  it('plan requires stockInvariant-only opening stock', () => {
    const src = fs.readFileSync('REAL_STORE_DATA_MIGRATION_PLAN.md','utf8');
    expect(src.includes('stockInvariant')).toBe(true);
    expect(src.includes('Dry-run') || src.includes('dry-run')).toBe(true);
  });
});
