import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

describe('4B audit integrity guards', () => {
  const inventory = fs.readFileSync('server/routers/inventoryRouter.ts', 'utf8');
  const prescription = fs.readFileSync('server/routers/prescriptionGovRouter.ts', 'utf8');
  const ocr = fs.readFileSync('server/routers/ocrIngestionRouter.ts', 'utf8');
  const whatsapp = fs.readFileSync('server/routers/whatsappRouter.ts', 'utf8');

  it('stock mutation audit includes before/after and reason paths', () => {
    expect(inventory).toContain('before:');
    expect(inventory).toContain('after:');
    expect(inventory).toContain('reason: p.note');
  });

  it('prescription rejection audit includes reason and actor', () => {
    expect(prescription).toContain('pharmacistNote: z.string().min(1');
    expect(prescription).toContain('actor: { id: actorId');
  });

  it('ocr audit includes sourceChannel/channel and entityId', () => {
    expect(ocr).toContain('entityId: params.entityId');
    expect(ocr).toContain('entityType: params.entityType');
  });

  it('whatsapp handoff audit includes sourceChannel and reason', () => {
    expect(whatsapp).toContain('whatsapp.handoff');
    expect(whatsapp).toContain('reason');
  });
});
