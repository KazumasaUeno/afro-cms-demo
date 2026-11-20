// callable の CORS の許可先（functions/src/cors.ts。security audit 2026-11-20 LOW）。test:functions が functions をビルドしてから走る
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { callableCors } = createRequire(import.meta.url)('../../functions/lib/cors.js');

test('本番: そのプロジェクトの Hosting のオリジンだけ', () => {
  assert.deepEqual(callableCors({ GCLOUD_PROJECT: 'afro-cms-4a6ff' }), ['https://afro-cms-4a6ff.web.app', 'https://afro-cms-4a6ff.firebaseapp.com']);
});
test('エミュレータ: 確認用の画面から呼べる', () => {
  assert.equal(callableCors({ FUNCTIONS_EMULATOR: 'true', GCLOUD_PROJECT: 'demo-afro-cms' }), true);
});
test('プロジェクトが無い・不正な形なら何も許可しない', () => {
  assert.equal(callableCors({}), false);
  assert.equal(callableCors({ GCLOUD_PROJECT: 'evil.com/x' }), false);
  assert.equal(callableCors({ GCLOUD_PROJECT: '' }), false);
});
