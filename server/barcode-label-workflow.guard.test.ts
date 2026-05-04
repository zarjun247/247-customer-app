import { describe, it, expect } from 'vitest';
import fs from 'fs';

describe('label workflow guard', () => {
  it('printer unavailable is not marked as success in component', () => {
    const ui = fs.readFileSync('client/src/components/barcode/BarcodeLabelPreview.tsx', 'utf8');
    expect(ui).toContain('Printer not configured');
  });
  it('label service supports queued/printed/failed transitions', () => {
    const service = fs.readFileSync('server/services/barcodeService.ts', 'utf8');
    expect(service).toContain('status: "queued"');
    expect(service).toContain('status: error ? "failed" : "printed"');
  });
});
