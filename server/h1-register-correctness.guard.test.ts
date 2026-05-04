import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

describe('h1 register correctness guards', () => {
  const source = fs.readFileSync('server/services/complianceGate.ts', 'utf8');
  it('does not fallback saleId to Number(saleId)||0', () => {
    expect(source).not.toContain('Number(saleId) || 0');
  });
  it('stores product name, not product id as drugName', () => {
    expect(source).toContain('product.name');
    expect(source).not.toContain('drugName: String(line.productId)');
  });
});
