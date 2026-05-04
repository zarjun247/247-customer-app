import { describe, it, expect } from 'vitest';
import { createSupplierSkuMapping } from './services/supplierSkuMapping';

describe('supplier sku mapping guards', () => {
  it('ambiguous low confidence stays draft', () => {
    const row = createSupplierSkuMapping([], { supplierId: 1, supplierSku: 'ABC', productId: 2, confidence: 40 });
    expect(row.status).toBe('draft');
  });
});
