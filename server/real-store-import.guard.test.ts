import { describe, it, expect } from 'vitest';
import fs from 'fs';

describe('real store import plan guards', () => {
  it('plan exists and references stockInvariant-only opening stock', () => {
    const body = fs.readFileSync('REAL_STORE_DATA_MIGRATION_PLAN.md', 'utf8');
    expect(body).toContain('stockInvariant');
    expect(body).toContain('dry_run');
  });
});
