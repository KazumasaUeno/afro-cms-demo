// worker の実行 SA は完全なメール（firebase-tools の Secret の IAM 確認は '@' の省略形を補わない。2026-11-25 G-7）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { aiWorkerServiceAccount } = createRequire(import.meta.url)('../../functions/lib/ai/index.js');

test('GCLOUD_PROJECT から完全なメールにする', () => {
  assert.equal(aiWorkerServiceAccount({ GCLOUD_PROJECT: 'afro-cms-4a6ff' }), 'afro-cms-ai-worker@afro-cms-4a6ff.iam.gserviceaccount.com');
});

test('予備: FIREBASE_CONFIG の projectId', () => {
  assert.equal(aiWorkerServiceAccount({ FIREBASE_CONFIG: JSON.stringify({ projectId: 'afro-cms-4a6ff' }) }), 'afro-cms-ai-worker@afro-cms-4a6ff.iam.gserviceaccount.com');
});

test('プロジェクトが分からない・形が違うときは省略形のまま（別の SA を作らない）', () => {
  for (const env of [{}, { GCLOUD_PROJECT: '' }, { GCLOUD_PROJECT: 'evil.com/x' }, { FIREBASE_CONFIG: 'not json' }]) {
    assert.equal(aiWorkerServiceAccount(env), 'afro-cms-ai-worker@');
  }
});
