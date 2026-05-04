import { describe, it, expect } from 'vitest';
import { validateProductForRegulatedSale } from './services/productMasterValidation';

describe('product master validation guards', () => {
  it('detects missing statutory fields', () => {
    const res = validateProductForRegulatedSale({ name:'X', requiresPrescription: true, schedule: null as any });
    expect(res.allowed).toBe(false);
  });
});
