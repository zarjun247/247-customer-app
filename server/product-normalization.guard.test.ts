import { describe, it, expect } from 'vitest';
import { buildCanonicalProductKey, detectPotentialDuplicateProducts } from './services/productNormalization';

describe('product normalization guards', () => {
  it('builds canonical key', () => {
    expect(buildCanonicalProductKey({ name: 'Paracetamol 650', strength: '650mg', form: 'tablet', packSize: '1x15', manufacturer: 'Acme' })).toContain('|');
  });
  it('detects duplicate candidates', () => {
    const out = detectPotentialDuplicateProducts([{ id:1, name:'Paracetamol', strength:'650mg', form:'tablet', packSize:'10', manufacturer:'A' },{ id:2, name:'PARACETAMOL', strength:'650 MG', form:'tablet', packSize:'10', manufacturer:'A' }]);
    expect(out.length).toBeGreaterThan(0);
  });
});
