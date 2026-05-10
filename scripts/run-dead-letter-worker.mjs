#!/usr/bin/env node
import { processDeadLettersOnce } from '../server/services/deadLetterWorker.ts';

(async () => {
  try {
    const res = await processDeadLettersOnce();
    console.log('run-dead-letter-worker result:', res);
    process.exit(0);
  } catch (e) {
    console.error('run-dead-letter-worker failed:', e?.message ?? e);
    process.exit(2);
  }
})();
