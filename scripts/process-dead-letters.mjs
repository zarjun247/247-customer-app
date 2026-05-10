#!/usr/bin/env node
import mysql from 'mysql2/promise';

async function main(){
  const url = process.env.DATABASE_URL;
  if(!url){
    console.error('DATABASE_URL not set. Set it to run this script.');
    process.exit(2);
  }
  let conn;
  try{
    conn = await mysql.createConnection(url);
  }catch(e){
    console.error('Failed to connect to DB:', e.message || e);
    process.exit(2);
  }
  try{
    const [rows] = await conn.execute(
      `SELECT id, provider, operation, errorMessage, attemptCount, updatedAt FROM provider_events WHERE status = 'dead_letter' LIMIT 100`
    );
    if((rows || []).length === 0){
      console.log('No provider_events in dead_letter state found.');
      await conn.end();
      process.exit(0);
    }
    console.log('Found', rows.length, 'dead-letter events. Inserting into provider_dead_letters if missing...');
    const insertSql = `INSERT INTO provider_dead_letters (providerEventId, reason, attemptCount, lastError, createdAt)
      SELECT ev.id, ev.errorMessage, COALESCE(ev.attemptCount,0), ev.errorMessage, NOW()
      FROM provider_events ev
      WHERE ev.status = 'dead_letter' AND NOT EXISTS (SELECT 1 FROM provider_dead_letters pd WHERE pd.providerEventId = ev.id)
      LIMIT 100`;
    const [res] = await conn.execute(insertSql);
    console.log('Inserted dead-letter rows result:', res);

    // Fetch inserted/available dead letters for operator summary
    const [deadLetters] = await conn.execute(`SELECT pd.id, pd.providerEventId, pd.reason, pd.attemptCount, pd.lastError, pd.createdAt FROM provider_dead_letters pd ORDER BY pd.createdAt DESC LIMIT 50`);
    console.log('Latest provider_dead_letters:');
    console.log(JSON.stringify(deadLetters, null, 2));
    await conn.end();
    process.exit(0);
  }catch(e){
    console.error('Error processing dead letters:', e.message || e);
    if(conn) await conn.end();
    process.exit(2);
  }
}

main();
