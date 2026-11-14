// Запуск: node tests/run.mjs   (из корня проекта)
import { readFileSync } from 'node:fs';
import { runTests } from './tests.js';
const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const results = runTests({ sites: read('../data/sites.json'), th: read('../data/thresholds.json') });
let failed = 0;
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  (${r.detail})` : ''}`);
  if (!r.ok) failed++;
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
