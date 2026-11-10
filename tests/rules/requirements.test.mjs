// requirements/current の許可・拒否（§28.5・§9 の生成した validAnswers・R-1・M-4・NC-4）
import { after, before, beforeEach, describe, test } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { deleteDoc, getDoc } from 'firebase/firestore';
import { createRulesEnv } from './guard.mjs';
import { ANSWERS, FULL_ANSWERS, PAST, T0, answerMetaFor, dbAs, deleteField, doc, seed, setDoc, stamp, updateDoc } from './fixtures.mjs';

let env;
before(async () => { env = await createRulesEnv(); });
after(async () => { await env?.clearFirestore(); await env?.cleanup(); });

const REQ = 'projects/p1/requirements/current';
/** 1 問の回答を書く（answerMeta も同じキーで） */
const answer = (uid, id, value) =>
  updateDoc(doc(dbAs(env, uid), REQ), { [`answers.${id}`]: value, [`answerMeta.${id}`]: { by: 'afro', at: T0 }, ...stamp(uid) });


describe('requirements/current: get', () => {
  beforeEach(async () => { await seed(env); });
  test('admin・アサインされた開発者・担当のお客様は読める', async () => {
    for (const uid of ['admin1', 'devA', 'devB', 'client1']) await assertSucceeds(getDoc(doc(dbAs(env, uid), REQ)));
  });
  test('アサイン外の開発者・他案件のお客様・無効化された人・未ログインは読めない', async () => {
    for (const uid of ['devC', 'client2', 'devOff', 'clientOff']) await assertFails(getDoc(doc(dbAs(env, uid), REQ)));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), REQ)));
  });
});

describe('requirements/current: 回答の更新（draft のとき）', () => {
  beforeEach(async () => { await seed(env); });
  test('アサインされた開発者は回答を書ける・消せる', async () => {
    await assertSucceeds(answer('devA', 'q-target', '30〜40代の経営者'));
    await assertSucceeds(answer('devB', 'q-cv', '資料請求'));
    await assertSucceeds(updateDoc(doc(dbAs(env, 'devA'), REQ), { 'answers.q-issue': deleteField(), 'answerMeta.q-issue': deleteField(), ...stamp('devA') }));
  });
  test('全 23 問を上限ちょうどで書ける（式数の上限に当たらない）', async () => {
    await assertSucceeds(updateDoc(doc(dbAs(env, 'devA'), REQ), { answers: FULL_ANSWERS, answerMeta: answerMetaFor(FULL_ANSWERS), ...stamp('devA') }));
  });
  test('お客様は回答を書けない（2026-11-10 決定でアフロが全問入力）', async () => {
    await assertFails(answer('client1', 'q-target', 'x'));
  });
  test('admin・アサイン外の開発者・無効化された開発者は書けない', async () => {
    await assertFails(answer('admin1', 'q-target', 'x'));
    await assertFails(answer('devC', 'q-target', 'x'));
    await assertFails(answer('devOff', 'q-target', 'x'));
  });
  test('answerMeta だけのキー（回答の無い meta）→ 拒否', async () => {
    await assertFails(updateDoc(doc(dbAs(env, 'devA'), REQ), { 'answerMeta.q-target': { by: 'client', at: T0 }, ...stamp('devA') }));
  });
  test('proposal / proposalRevision を draft のまま書く → 拒否', async () => {
    await assertFails(updateDoc(doc(dbAs(env, 'devA'), REQ), { proposalRevision: 1, ...stamp('devA') }));
  });
  test('updatedAt を過去・updatedBy を他人 → 拒否', async () => {
    await assertFails(updateDoc(doc(dbAs(env, 'devA'), REQ), { 'answers.q-target': 'x', 'answerMeta.q-target': { by: 'afro', at: T0 }, updatedAt: PAST, updatedBy: 'devA' }));
    await assertFails(updateDoc(doc(dbAs(env, 'devA'), REQ), { 'answers.q-target': 'x', 'answerMeta.q-target': { by: 'afro', at: T0 }, ...stamp('devB') }));
  });
  test('schemaVersion・mode は変えられない', async () => {
    await assertFails(updateDoc(doc(dbAs(env, 'devA'), REQ), { schemaVersion: 2, ...stamp('devA') }));
    await assertFails(updateDoc(doc(dbAs(env, 'devA'), REQ), { mode: 'client', ...stamp('devA') }));
  });
  test('削除は誰もできない', async () => {
    await assertFails(deleteDoc(doc(dbAs(env, 'devA'), REQ)));
    await assertFails(deleteDoc(doc(dbAs(env, 'admin1'), REQ)));
  });
});

describe('requirements/current: analyzed・approved では回答を変えられない（NC-4・§28.5）', () => {
  test('analyzed で回答変更 → 拒否', async () => {
    await seed(env, { reqState: 'analyzed' });
    await assertFails(answer('devA', 'q-target', '変更'));
  });
  test('approved で回答変更・提案変更 → 拒否', async () => {
    await seed(env, { reqState: 'approved' });
    await assertFails(answer('devA', 'q-target', '変更'));
    await assertFails(updateDoc(doc(dbAs(env, 'devA'), REQ), { 'proposal.currentScore': 99, ...stamp('devA') }));
  });
  test('analyzed で提案だけ書き換える（submit のバッチ外）→ 拒否', async () => {
    await seed(env, { reqState: 'analyzed' });
    await assertFails(updateDoc(doc(dbAs(env, 'devA'), REQ), { 'proposal.currentScore': 99, proposalRevision: 1, ...stamp('devA') }));
  });
});

describe('validAnswers（§9 生成。上限ちょうど→許可、+1→拒否）', () => {
  beforeEach(async () => { await seed(env); });
  const ok = (name, id, v) => test(`許可: ${name}`, async () => { await assertSucceeds(answer('devA', id, v)); });
  const ng = (name, id, v) => test(`拒否: ${name}`, async () => { await assertFails(answer('devA', id, v)); });
  ok('text 120 文字', 'q-target', 'あ'.repeat(120));
  ng('text 121 文字', 'q-target', 'あ'.repeat(121));
  ok('text は trim 後で数える（前後の空白込み 124 文字）', 'q-target', '  ' + 'あ'.repeat(120) + '  ');
  ng('text 空白だけ（未回答はキーを持たない）', 'q-target', '   ');
  ng('text 空文字', 'q-target', '');
  ng('text に配列', 'q-target', ['a']);
  ng('text に数値', 'q-target', 1);
  ok('longtext 600 文字', 'q-issue', 'あ'.repeat(600));
  ng('longtext 601 文字', 'q-issue', 'あ'.repeat(601));
  ok('longtext 1 文字（下限 4 は Rules に入れない。§9 [DECISION]）', 'q-issue', 'あ');
  ok('url 200 文字', 'q-url', 'https://' + 'a'.repeat(200 - 11) + '.jp');
  ng('url 201 文字', 'q-url', 'https://' + 'a'.repeat(201 - 11) + '.jp');
  ok('url http（大文字の HTTPS も）', 'q-url', 'HTTPS://Example.co.jp/path?q=1');
  ng('url javascript:', 'q-url', 'javascript:alert(1)');
  ng('url ホストに "." が無い', 'q-url', 'https://localhost/a.b');
  ng('url スキーム無し', 'q-url', 'example.co.jp');
  ok('single 選択肢のどれか', 'q-cv', '購入');
  ng('single 選択肢外', 'q-cv', '電話');
  ng('single に配列', 'q-cv', ['購入']);
  ok('multi 選択肢の全部', 'q-improve', ['ファーストビュー', 'ナビゲーション', 'スマホ表示', '表示速度', '問い合わせ導線', '写真・ビジュアル', 'SEO', '更新のしやすさ']);
  ng('multi 選択肢外を含む', 'q-purpose', ['問い合わせを増やしたい', '株価を上げたい']);
  ng('multi 空配列', 'q-purpose', []);
  ng('multi 選択肢数を超える（重複で水増し）', 'q-purpose', Array(7).fill('問い合わせを増やしたい'));
  ng('multi に文字列', 'q-purpose', '問い合わせを増やしたい');
  ok('競合 3 件', 'q-competitor', ['https://a.example.jp', 'https://b.example.jp', 'https://c.example.jp']);
  ng('競合 4 件', 'q-competitor', ['https://a.example.jp', 'https://b.example.jp', 'https://c.example.jp', 'https://d.example.jp']);
  ng('競合 空配列', 'q-competitor', []);
  ng('競合の要素が数値', 'q-competitor', [1]);
  ng('競合の要素が 201 文字', 'q-competitor', ['https://' + 'a'.repeat(190) + '.jp']);
  ng('未知の質問 ID', 'q-unknown', 'x');
  ng('質問 ID に似た別名（大文字）', 'Q-TARGET', 'x');
});

describe('requirements/current: create（R-1・SEC-8）', () => {
  beforeEach(async () => {
    await seed(env);
    // p1 の requirements/current が無い状態（案件作成のバッチで作り損ねた場合）
    await env.withSecurityRulesDisabled(async (ctx) => { await deleteDoc(doc(ctx.firestore(), REQ)); });
  });
  const base = (uid = 'devA') => ({ schemaVersion: 1, answers: {}, answerMeta: {}, ...stamp(uid) });
  test('アサインされた開発者は空の回答で作れる（mode: afro も可）', async () => {
    await assertSucceeds(setDoc(doc(dbAs(env, 'devA'), REQ), base()));
  });
  test('mode: afro 付き・回答付きで作れる', async () => {
    await assertSucceeds(setDoc(doc(dbAs(env, 'devA'), REQ), { ...base(), mode: 'afro', answers: ANSWERS, answerMeta: answerMetaFor(ANSWERS) }));
  });
  test('SEC-8: proposalRevision 付きで create → 拒否', async () => {
    await assertFails(setDoc(doc(dbAs(env, 'devA'), REQ), { ...base(), proposalRevision: 1 }));
  });
  test('SEC-8: proposal 付きで create → 拒否', async () => {
    await assertFails(setDoc(doc(dbAs(env, 'devA'), REQ), { ...base(), proposal: { hostname: 'x' } }));
  });
  test('mode が afro 以外・schemaVersion なし・不正な回答 → 拒否', async () => {
    await assertFails(setDoc(doc(dbAs(env, 'devA'), REQ), { ...base(), mode: 'client' }));
    const { schemaVersion: _v, ...noVer } = base();
    await assertFails(setDoc(doc(dbAs(env, 'devA'), REQ), noVer));
    await assertFails(setDoc(doc(dbAs(env, 'devA'), REQ), { ...base(), answers: { 'q-cv': '電話' }, answerMeta: { 'q-cv': { by: 'afro', at: T0 } } }));
  });
  test('アサイン外の開発者・お客様・admin は作れない', async () => {
    await assertFails(setDoc(doc(dbAs(env, 'devC'), REQ), base('devC')));
    await assertFails(setDoc(doc(dbAs(env, 'client1'), REQ), base('client1')));
    await assertFails(setDoc(doc(dbAs(env, 'admin1'), REQ), base('admin1')));
  });
  test('案件が analyzed のときは作れない', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => { await updateDoc(doc(ctx.firestore(), 'projects/p1'), { 'requirements.status': 'analyzed', 'requirements.revision': 1 }); });
    await assertFails(setDoc(doc(dbAs(env, 'devA'), REQ), base()));
  });
});
