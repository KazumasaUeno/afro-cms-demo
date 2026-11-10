// A1 のスモーク: プレースホルダの firestore.rules（全拒否）が効いていることと、自己防衛が働くことを確かめる。
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { assertDemoProject, createRulesEnv, emulatorHostFromEnv } from './guard.mjs';

describe('自己防衛', () => {
  test('demo- 以外の projectId は throw', () => {
    assert.throws(() => assertDemoProject('castfile-prod'), /demo-/);
    assert.throws(() => assertDemoProject(undefined), /demo-/);
    assert.equal(assertDemoProject('demo-afro-cms'), 'demo-afro-cms');
  });
  test('エミュレータの host が無い・ローカル以外なら throw', () => {
    assert.throws(() => emulatorHostFromEnv('FIRESTORE_EMULATOR_HOST', {}), /emulators:exec/);
    assert.throws(() => emulatorHostFromEnv('FIRESTORE_EMULATOR_HOST', { FIRESTORE_EMULATOR_HOST: 'firestore.googleapis.com:443' }), /ローカル/);
  });
});

describe('全拒否のプレースホルダ', () => {
  let env;
  before(async () => {
    env = await createRulesEnv();
    // Rules を通さずに 1 件置き、「読めないのは文書が無いからではない」ことを担保する
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'projects/p1'), { siteName: 'x', memberUids: ['dev1'] });
    });
  });
  after(async () => {
    await env?.clearFirestore();
    await env?.cleanup();
  });

  test('ルール無効の管理コンテキストでは読める（前提の確認）', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await assertSucceeds(getDoc(doc(ctx.firestore(), 'projects/p1')));
    });
  });
  test('未ログインは get も set も拒否', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'projects/p1')));
    await assertFails(setDoc(doc(db, 'projects/p2'), { siteName: 'y' }));
  });
  test('メール確認済みのログインでも get・list・set を拒否', async () => {
    const db = env.authenticatedContext('dev1', { email: 'dev1@example.com', email_verified: true }).firestore();
    await assertFails(getDoc(doc(db, 'projects/p1')));
    await assertFails(getDocs(query(collection(db, 'projects'), where('memberUids', 'array-contains', 'dev1'))));
    await assertFails(setDoc(doc(db, 'accounts/dev1'), { role: 'admin' }));
  });
});
