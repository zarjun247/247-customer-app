#!/usr/bin/env node
import mysql from 'mysql2/promise';
import fs from 'fs';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL required');
  process.exit(2);
}

(async function(){
  const conn = await mysql.createConnection(url);
  // identify potential duplicates by supplier + invoiceNumber + storeId
  const [rows] = await conn.execute(`
    SELECT supplierId, invoiceNumber, storeId, COUNT(*) as cnt, GROUP_CONCAT(id) as ids
    FROM purchase_invoices
    GROUP BY supplierId, invoiceNumber, storeId
    HAVING cnt > 1
    ORDER BY cnt DESC
  `);
  const out = Array.isArray(rows) ? rows : [];
  console.log('Found', out.length, 'duplicate groups');
  const csv = ['supplierId,invoiceNumber,storeId,count,ids'];
  for (const r of out) csv.push([r.supplierId, '"'+String(r.invoiceNumber).replace(/"/g,'""')+'"', r.storeId, r.cnt, '"'+String(r.ids)+'"'].join(','));
  const path = './tmp_supplier_invoice_duplicates.csv';
  fs.writeFileSync(path, csv.join('\n'));
  console.log('Wrote report to', path);
  await conn.end();
})();
