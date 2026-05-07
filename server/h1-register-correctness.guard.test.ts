import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

describe('h1 register correctness guards', () => {
  const source = fs.readFileSync('server/services/complianceGate.ts', 'utf8');
  const schema = fs.readFileSync('drizzle/schema.ts', 'utf8');
  const migration = fs.readFileSync('drizzle/0032_h1_statutory_schema.sql', 'utf8');

  it('adds schema-safe statutory H1 reference fields', () => {
    for (const field of ['saleRef', 'saleLineRef', 'saleBillNo', 'productId', 'batchLedgerId', 'batchId', 'doctorName', 'doctorRegNo', 'statutoryContextStatus']) {
      expect(schema).toContain(field);
      expect(migration).toContain(field);
    }
  });

  it('h1 creation writes sale refs, bill refs, product, drug, and batch refs', () => {
    for (const token of ['saleRef', 'saleLineRef', 'saleBillNo', 'billNo: saleBillNo', 'productId: productRef', 'drugName', 'batchNo', 'batchLedgerId', 'batchId']) {
      expect(source).toContain(token);
    }
  });

  it('does not fallback or coerce H1 statutory identity through unsafe numeric casts', () => {
    expect(source).not.toContain('Number(saleId)');
    expect(source).not.toContain('Number(line.id)');
    expect(source).not.toContain('Number(uuid)');
    expect(source).not.toContain('entityId: 0');
    expect(source).not.toContain('|| 0');
    expect(source).toContain('parseOptionalLegacyIntegerRef');
  });

  it('requires doctor context before final H1 row creation', () => {
    expect(source).toContain('Doctor name required before creating final H1 register row');
    expect(source).toContain('statutoryContextStatus: "complete"');
  });

  it('verifies existing sale-line H1 row instead of duplicating', () => {
    expect(source).toContain('eq(h1Register.saleRef, saleRef)');
    expect(source).toContain('eq(h1Register.saleLineRef, saleLineRef)');
    expect(source).toContain('h1.register.verified');
    expect(schema).toContain('uq_h1_register_sale_line_ref');
  });

  it('audit payload includes string-safe sale refs and line refs', () => {
    expect(source).toContain('const auditPayload = { saleRef, saleLineRef');
    expect(source).toContain('afterJson: auditPayload');
    expect(source).toContain('afterJson: { ...auditPayload, h1RegisterId: existing.id }');
  });

  it('stores product name, not product id as drugName', () => {
    expect(source).toContain('product?.name');
    expect(source).not.toContain('drugName: String(line.productId)');
  });
});
