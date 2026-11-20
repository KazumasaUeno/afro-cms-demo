// クライアント（src/live/functionsRegion.ts）と関数（functions/src/index.ts）のリージョンが一致していること（code review 2026-11-20 Minor）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('functions REGION matches client FUNCTIONS_REGION', () => {
  const server = read('functions/src/index.ts').match(/export const REGION = '([^']+)'/)?.[1];
  const client = read('src/live/functionsRegion.ts').match(/export const FUNCTIONS_REGION = '([^']+)'/)?.[1];
  assert.ok(server, 'REGION not found in functions/src/index.ts');
  assert.equal(client, server);
});
