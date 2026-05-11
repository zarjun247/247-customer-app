import { describe, it, expect } from 'vitest';
import fs from 'fs';

describe('real store import plan guards', () => {
  it('operations doc references stockInvariant discipline and dry-run safety for store onboarding', () => {
    const body = fs.readFileSync('docs/OPERATIONS.md', 'utf8');
    expect(body).toContain('stockInvariant');
    expect(body.toLowerCase()).toMatch(/dry.run/);
  });
});
