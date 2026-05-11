import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = process.cwd();
const drizzleDir = join(repoRoot, 'drizzle');
const migrationName = '0044_index_performance_audit.sql';
const migrationPath = join(drizzleDir, migrationName);
const migrationSql = readFileSync(migrationPath, 'utf8');
const schemaSql = readFileSync(join(drizzleDir, 'schema.ts'), 'utf8');
const statusDoc = readFileSync(join(repoRoot, 'docs', 'STATUS.md'), 'utf8');

const indexNames = [...migrationSql.matchAll(/ADD\s+INDEX\s+`([^`]+)`/gi)].map((match) => match[1]);
const schemaIndexNames = [...schemaSql.matchAll(/(?:index|uniqueIndex)\("([^"]+)"\)/g)].map((match) => match[1]);

const requiredCoverage = [
  { area: 'products/barcodes', indexes: ['idx_products_canonical_name', 'idx_products_barcode', 'idx_product_barcodes_barcode', 'idx_barcode_aliases_product_batch'] },
  { area: 'batchLedger/stock movements', indexes: ['idx_batch_ledger_store_product_expiry', 'idx_stock_movements_store_batch_date'] },
  { area: 'reservations', indexes: ['idx_stock_reservations_store_status_expires', 'idx_stock_reservations_order_status'] },
  { area: 'invoices/bill numbers', indexes: ['uq_sales_bill_no', 'idx_invoice_snapshots_bill_no', 'credit_notes_credit_note_no_unique'] },
  { area: 'payments/refunds', indexes: ['idx_counter_payments_gateway_ref', 'idx_refunds_sale_status'] },
  { area: 'H1 register', indexes: ['idx_h1_register_store_created', 'idx_h1_register_bill_no'] },
  { area: 'audit logs', indexes: ['idx_audit_logs_entity_created', 'idx_audit_logs_action_created'] },
];

describe('database index audit migration guards', () => {
  it('does not duplicate a migration number', () => {
    const numbered = readdirSync(drizzleDir).filter((file) => /^\d{4}_.*\.sql$/.test(file));
    const numbers = numbered.map((file) => file.slice(0, 4));
    const duplicateNumbers = numbers.filter((number, index) => numbers.indexOf(number) !== index);

    expect(duplicateNumbers).toEqual([]);
    expect(numbered.filter((file) => file.startsWith('0044_'))).toEqual([migrationName]);
  });

  it('has no duplicate index names in the new migration', () => {
    const duplicateIndexNames = indexNames.filter((name, index) => indexNames.indexOf(name) !== index);

    expect(indexNames.length).toBeGreaterThan(30);
    expect(duplicateIndexNames).toEqual([]);
  });

  it('keeps migration statements limited to additive secondary indexes', () => {
    const normalized = migrationSql.replace(/--.*$/gm, '').trim();
    const statements = normalized.split(';').map((statement) => statement.trim()).filter(Boolean);

    expect(statements.length).toBeGreaterThan(10);
    for (const statement of statements) {
      expect(statement).toMatch(/^ALTER TABLE `[^`]+`\s+ADD INDEX `[^`]+`/i);
      expect(statement).not.toMatch(/DROP|DELETE|UPDATE|INSERT|MODIFY|CHANGE|ADD\s+CONSTRAINT|FOREIGN\s+KEY/i);
    }
  });

  it('mirrors new migration index names in drizzle schema metadata', () => {
    const missingFromSchema = indexNames.filter((name) => !schemaIndexNames.includes(name));

    expect(missingFromSchema).toEqual([]);
  });

  it('covers critical query families with indexes or documented deferrals', () => {
    const combinedEvidence = [migrationSql, schemaSql, statusDoc].join('\n');

    for (const coverage of requiredCoverage) {
      const hasIndexOrDeferral = coverage.indexes.some((indexName) => combinedEvidence.includes(indexName))
        || new RegExp(`${coverage.area}.*defer`, 'i').test(combinedEvidence);
      expect(hasIndexOrDeferral, coverage.area).toBe(true);
    }
  });

  it('documents that empirical proof is required before performance and deployment claims', () => {
    expect(statusDoc).toContain('NO-GO for live controlled production');
    expect(statusDoc).toMatch(/Hosted DB observation still required|no production deployment.*proof claimed/i);
  });
});
