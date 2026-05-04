import { describe, it, expect } from 'vitest';
import { requirePharmacistSubstitutionApproval } from './services/substitutionGovernance';

describe('substitution governance guards', () => {
  it('cannot auto approve without pharmacist', () => {
    expect(requirePharmacistSubstitutionApproval({ originalProductId:1, substituteProductId:2, reason:'alt', status:'approved' })).toBe(true);
  });
});
