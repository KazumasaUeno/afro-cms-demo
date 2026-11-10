// 状態遷移と承認の証跡（§6・§7・§28.4・§28.6・§28.7。M-2・M-3・M-4・M-8・M-11、SEC-2・SEC-3・SEC-4・SEC-6・SEC-7）
import { after, before, describe, test } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, collectionGroup, deleteDoc, getDoc, getDocs, limit, orderBy, query, runTransaction } from 'firebase/firestore';
import { createRulesEnv } from './guard.mjs';
import {
  ANSWERS, FULL_ANSWERS, PAST, PROPOSAL, T0, approvalDoc, approveBatch, dbAs, doc, seed, serverTimestamp, setDoc, stamp, submitBatch, updateDoc, withdrawBatch,
} from './fixtures.mjs';

let env;
before(async () => { env = await createRulesEnv(); });
after(async () => { await env?.clearFirestore(); await env?.cleanup(); });

const point = (i, over = {}) => ({ id: `pp${i}`, area: 'SEO', priority: 'medium', title: 't'.repeat(80), detail: 'd'.repeat(600), impact: 'i'.repeat(200), ...over });
const FULL_PROPOSAL = {
  hostname: 'h'.repeat(253), issue: 'あ'.repeat(600),
  purposes: ['問い合わせを増やしたい', '採用を強化したい', 'ブランドを刷新したい', 'EC売上を伸ばしたい', '更新を楽にしたい', 'スマホ対応したい'],
  improves: ['ファーストビュー', 'ナビゲーション', 'スマホ表示', '表示速度', '問い合わせ導線', '写真・ビジュアル', 'SEO', '更新のしやすさ'],
  competitors: ['a'.repeat(253), 'b.example.jp', 'c.example.jp'], currentScore: 0, projectedScore: 100,
  points: [1, 2, 3, 4, 5, 6].map((i) => point(i)),
};

describe('確認依頼（submit: draft → analyzed）', () => {
  test('アサインされた開発者は 3 文書を 1 バッチで書ける（協力会社も）', async () => {
    await seed(env);
    await assertSucceeds(submitBatch(dbAs(env, 'devA')));
    await seed(env);
    await assertSucceeds(submitBatch(dbAs(env, 'devB')));
  });
  test('全 23 問・提案 6 件を上限ちょうどで submit できる（式数・get の上限に当たらない）', async () => {
    await seed(env);
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'projects/p1/requirements/current'), { answers: FULL_ANSWERS, answerMeta: Object.fromEntries(Object.keys(FULL_ANSWERS).map((k) => [k, { by: 'afro', at: T0 }])) });
    });
    await assertSucceeds(submitBatch(dbAs(env, 'devA'), { answers: FULL_ANSWERS, proposal: FULL_PROPOSAL }));
  });
  test('トランザクションでも submit できる', async () => {
    await seed(env);
    const db = dbAs(env, 'devA');
    await assertSucceeds(runTransaction(db, async (tx) => {
      const p = await tx.get(doc(db, 'projects/p1'));
      const rev = p.data().requirements.revision + 1;
      tx.update(doc(db, 'projects/p1'), { requirements: { status: 'analyzed', revision: rev, analyzedAt: serverTimestamp() }, ...stamp('devA') });
      tx.update(doc(db, 'projects/p1/requirements/current'), { proposal: PROPOSAL, proposalRevision: rev, ...stamp('devA') });
      tx.set(doc(db, `projects/p1/approvals/requirements-r${rev}-submit`), approvalDoc('devA', 'submit', rev, { answers: ANSWERS, proposal: PROPOSAL }));
    }));
  });
  const deny = (name, opts, uid = 'devA', reqState = 'draft') => test(name, async () => {
    await seed(env, { reqState });
    await assertFails(submitBatch(dbAs(env, uid), opts));
  });
  deny('お客様は submit できない', { uid: 'client1' }, 'client1');
  deny('admin は submit できない', { uid: 'admin1' }, 'admin1');
  deny('アサイン外の開発者は submit できない', { uid: 'devC' }, 'devC');
  deny('無効化された開発者は submit できない', { uid: 'devOff' }, 'devOff');
  deny('状態だけ更新（ログなし）→ 拒否', { mutate: { skipLog: true } });
  deny('ログと状態だけ（提案を書かない）→ 拒否', { mutate: { skipReq: true } });
  deny('revision を +2 する → 拒否', { mutate: { project: { requirements: { status: 'analyzed', revision: 2, analyzedAt: serverTimestamp() }, ...stamp('devA') }, req: { proposal: PROPOSAL, proposalRevision: 2, ...stamp('devA') }, aid: 'requirements-r2-submit', log: approvalDoc('devA', 'submit', 2, { answers: ANSWERS, proposal: PROPOSAL }) } });
  deny('analyzedAt を過去日時にする → 拒否', { mutate: { project: { requirements: { status: 'analyzed', revision: 1, analyzedAt: PAST }, ...stamp('devA') } } });
  deny('submit と同時に approvedBy を持たせる → 拒否', { mutate: { project: { requirements: { status: 'analyzed', revision: 1, analyzedAt: serverTimestamp(), approvedBy: 'client1' }, ...stamp('devA') } } });
  deny('ログの写し（answers）を改変 → 拒否', { mutate: { log: approvalDoc('devA', 'submit', 1, { answers: { ...ANSWERS, 'q-issue': '改変' }, proposal: PROPOSAL }) } });
  deny('ログの写し（proposal）を改変 → 拒否', { mutate: { log: approvalDoc('devA', 'submit', 1, { answers: ANSWERS, proposal: { ...PROPOSAL, currentScore: 99 } }) } });
  deny('ログの文書 ID が規則外 → 拒否', { mutate: { aid: 'my-own-id' } });
  deny('ログの日時を過去にする → 拒否', { mutate: { log: approvalDoc('devA', 'submit', 1, { answers: ANSWERS, proposal: PROPOSAL, at: PAST }) } });
  deny('ログの名義を他人にする → 拒否', { mutate: { log: { ...approvalDoc('devA', 'submit', 1, { answers: ANSWERS, proposal: PROPOSAL }), actorName: '協力 開発B' } } });
  deny('ログの side を client にする → 拒否', { mutate: { log: { ...approvalDoc('devA', 'submit', 1, { answers: ANSWERS, proposal: PROPOSAL }), side: 'client' } } });
  deny('M-4 / SEC-4: 1 バッチで analyzed 遷移＋回答変更 → 拒否', { mutate: { req: { proposal: PROPOSAL, proposalRevision: 1, 'answers.q-issue': '直前に変更', ...stamp('devA') } } });
  deny('analyzed から 2 回目の submit → 拒否', { fromRev: 1, mutate: {} }, 'devA', 'analyzed');
  deny('approved から submit → 拒否', { fromRev: 1 }, 'devA', 'approved');
});

describe('M-11 / SEC-7: validProposal', () => {
  const deny = (name, proposal) => test(name, async () => {
    await seed(env);
    await assertFails(submitBatch(dbAs(env, 'devA'), { proposal }));
  });
  deny('提案に未知のキー → 拒否', { ...PROPOSAL, script: '<script>' });
  deny('提案のキーが足りない → 拒否', (({ points: _p, ...rest }) => rest)(PROPOSAL));
  deny('currentScore が文字列 → 拒否', { ...PROPOSAL, currentScore: '<b>52</b>' });
  deny('projectedScore が 101 → 拒否', { ...PROPOSAL, projectedScore: 101 });
  deny('currentScore が負 → 拒否', { ...PROPOSAL, currentScore: -1 });
  deny('issue が 601 文字（巨大文字列）→ 拒否', { ...PROPOSAL, issue: 'あ'.repeat(601) });
  deny('hostname が空 → 拒否', { ...PROPOSAL, hostname: '' });
  deny('R-2: purposes を重複で水増し（7 件）→ 拒否', { ...PROPOSAL, purposes: Array(7).fill('問い合わせを増やしたい') });
  deny('R-2: improves を重複で水増し（9 件）→ 拒否', { ...PROPOSAL, improves: Array(9).fill('SEO') });
  deny('purposes に選択肢外 → 拒否', { ...PROPOSAL, purposes: ['株価を上げたい'] });
  deny('競合 4 件 → 拒否', { ...PROPOSAL, competitors: ['a.jp', 'b.jp', 'c.jp', 'd.jp'] });
  deny('提案ポイント 7 件 → 拒否', { ...PROPOSAL, points: [1, 2, 3, 4, 5, 6, 7].map((i) => point(i)) });
  deny('ポイントに未知のキー → 拒否', { ...PROPOSAL, points: [point(1, { html: '<img onerror>' })] });
  deny('ポイントの priority が選択肢外 → 拒否', { ...PROPOSAL, points: [point(1, { priority: 'urgent' })] });
  deny('ポイントの detail が 601 文字 → 拒否', { ...PROPOSAL, points: [point(1), point(2, { detail: 'd'.repeat(601) })] });
  deny('6 件目のポイントだけ壊れている → 拒否', { ...PROPOSAL, points: [1, 2, 3, 4, 5].map((i) => point(i)).concat([point(6, { title: '' })]) });
  deny('points が配列でない → 拒否', { ...PROPOSAL, points: { 0: point(1) } });
  test('提案ポイント 0 件・競合 0 件は許可', async () => {
    await seed(env);
    await assertSucceeds(submitBatch(dbAs(env, 'devA'), { proposal: { ...PROPOSAL, competitors: [], points: [] } }));
  });
});

describe('差し戻し（withdraw: analyzed → draft）', () => {
  test('アサインされた開発者は差し戻せる（理由あり・なし）', async () => {
    await seed(env, { reqState: 'analyzed' });
    await assertSucceeds(withdrawBatch(dbAs(env, 'devA')));
    await seed(env, { reqState: 'analyzed' });
    await assertSucceeds(withdrawBatch(dbAs(env, 'devB'), { uid: 'devB', note: undefined }));
  });
  test('差し戻し → 回答の修正 → 再 submit（revision 2）まで通る', async () => {
    await seed(env, { reqState: 'analyzed' });
    const db = dbAs(env, 'devA');
    await assertSucceeds(withdrawBatch(db));
    await assertSucceeds(updateDoc(doc(db, 'projects/p1/requirements/current'), { 'answers.q-issue': '修正後の課題', 'answerMeta.q-issue': { by: 'afro', at: T0 }, ...stamp('devA') }));
    const answers = { ...ANSWERS, 'q-issue': '修正後の課題' };
    await assertSucceeds(submitBatch(db, { fromRev: 1, answers }));
  });
  test('再 submit で古い revision の提案のまま（proposal を書かない）→ 拒否（R-1 と同じ穴）', async () => {
    await seed(env, { reqState: 'analyzed' });
    const db = dbAs(env, 'devA');
    await assertSucceeds(withdrawBatch(db));
    await assertFails(submitBatch(db, { fromRev: 1, mutate: { skipReq: true } }));
  });
  const deny = (name, opts, uid = 'devA', reqState = 'analyzed') => test(name, async () => {
    await seed(env, { reqState });
    await assertFails(withdrawBatch(dbAs(env, uid), opts));
  });
  deny('ログなしで状態だけ戻す → 拒否', { mutate: { skipLog: true } });
  deny('理由が 201 文字 → 拒否', { note: 'あ'.repeat(201) });
  deny('差し戻しと同時に revision を変える → 拒否', { mutate: { project: { 'requirements.status': 'draft', 'requirements.revision': 0, ...stamp('devA') } } });
  deny('差し戻しと同時に回答を変える → 拒否', { mutate: { req: { 'answers.q-issue': '変更', ...stamp('devA') } } });
  deny('お客様は差し戻せない', { uid: 'client1' }, 'client1');
  deny('アサイン外の開発者は差し戻せない', { uid: 'devC' }, 'devC');
  deny('approved から draft へ戻す → 拒否（approved は終端）', {}, 'devA', 'approved');
  deny('draft のときに withdraw ログを作る → 拒否', {}, 'devA', 'draft');
  deny('withdraw ログに answers を付ける → 拒否', { mutate: { log: approvalDoc('devA', 'withdraw', 1, { answers: ANSWERS }) } });
});

describe('お客様の承認（approve: analyzed → approved）', () => {
  test('担当のお客様は 1 バッチで承認できる', async () => {
    await seed(env, { reqState: 'analyzed' });
    await assertSucceeds(approveBatch(dbAs(env, 'client1')));
  });
  test('トランザクションでも承認できる（§7.2 の runTransaction）', async () => {
    await seed(env, { reqState: 'analyzed' });
    const db = dbAs(env, 'client1');
    await assertSucceeds(runTransaction(db, async (tx) => {
      const p = await tx.get(doc(db, 'projects/p1'));
      const r = await tx.get(doc(db, 'projects/p1/requirements/current'));
      const rev = p.data().requirements.revision;
      const aid = `requirements-r${rev}-approve`;
      tx.update(doc(db, 'projects/p1'), { 'requirements.status': 'approved', 'requirements.approvedAt': serverTimestamp(), 'requirements.approvedBy': 'client1', 'requirements.approvalId': aid, ...stamp('client1') });
      tx.set(doc(db, `projects/p1/approvals/${aid}`), approvalDoc('client1', 'approve', rev, { answers: r.data().answers, proposal: r.data().proposal }));
    }));
  });
  test('全 23 問・提案 6 件の承認（写しの一致の比較が上限に当たらない）', async () => {
    await seed(env, { reqState: 'analyzed' });
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'projects/p1/requirements/current'), { answers: FULL_ANSWERS, proposal: FULL_PROPOSAL });
    });
    await assertSucceeds(approveBatch(dbAs(env, 'client1'), { answers: FULL_ANSWERS, proposal: FULL_PROPOSAL }));
  });
  const deny = (name, opts, uid = 'client1', reqState = 'analyzed') => test(name, async () => {
    await seed(env, { reqState });
    await assertFails(approveBatch(dbAs(env, uid), opts));
  });
  const ok = approvalDoc('client1', 'approve', 1, { answers: ANSWERS, proposal: PROPOSAL });
  deny('他案件のお客様は承認できない', { uid: 'client2' }, 'client2');
  deny('無効化されたお客様は承認できない', { uid: 'clientOff' }, 'clientOff');
  deny('SEC-3 / §25-2: 開発者は承認できない（代理承認の禁止）', { uid: 'devA' }, 'devA');
  deny('admin は承認できない', { uid: 'admin1' }, 'admin1');
  deny('draft のときは承認できない', {}, 'client1', 'draft');
  deny('同じ revision で 2 回目（approved 後）→ 拒否', {}, 'client1', 'approved');
  deny('状態だけ更新（ログなし）→ 拒否', { mutate: { skipLog: true } });
  deny('ログだけ作成（状態を変えない）→ 拒否', { mutate: { skipProject: true } });
  deny('過去日時のログ → 拒否', { mutate: { log: { ...ok, at: PAST } } });
  deny('approvedAt を過去日時にする → 拒否', { mutate: { project: { 'requirements.status': 'approved', 'requirements.approvedAt': PAST, 'requirements.approvedBy': 'client1', 'requirements.approvalId': 'requirements-r1-approve', ...stamp('client1') } } });
  deny('他人名義（actorName）→ 拒否', { mutate: { log: { ...ok, actorName: '別の人' } } });
  deny('他人名義（actorUid）→ 拒否', { mutate: { log: { ...ok, actorUid: 'client2' } } });
  deny('他人名義（actorEmail）→ 拒否', { mutate: { log: { ...ok, actorEmail: 'client2@other.example' } } });
  deny('approvedBy を他人にする → 拒否', { mutate: { project: { 'requirements.status': 'approved', 'requirements.approvedAt': serverTimestamp(), 'requirements.approvedBy': 'devA', 'requirements.approvalId': 'requirements-r1-approve', ...stamp('client1') } } });
  deny('改変した写し（answers）→ 拒否', { mutate: { log: { ...ok, answers: { ...ANSWERS, 'q-issue': '都合よく変更' } } } });
  deny('改変した写し（proposal）→ 拒否', { mutate: { log: { ...ok, proposal: { ...PROPOSAL, projectedScore: 100 } } } });
  deny('写しを省く → 拒否', { mutate: { log: (({ answers: _a, proposal: _p, ...rest }) => rest)(ok) } });
  deny('ログに note・未知のキー → 拒否', { mutate: { log: { ...ok, note: '承認します' } } });
  deny('ログの side を afro にする → 拒否', { mutate: { log: { ...ok, side: 'afro' } } });
  deny('ログの文書 ID が規則外 → 拒否', { mutate: { aid: 'requirements-r2-approve' } });
  deny('承認と同時に回答を変える → 拒否', { mutate: { req: { 'answers.q-issue': '変更', ...stamp('client1') } } });
  deny('SEC-2 / M-2: 承認で requirements.analyzedAt を同時変更 → 拒否', { mutate: { project: { 'requirements.status': 'approved', 'requirements.approvedAt': serverTimestamp(), 'requirements.approvedBy': 'client1', 'requirements.approvalId': 'requirements-r1-approve', 'requirements.analyzedAt': serverTimestamp(), ...stamp('client1') } } });
  deny('M-2: 承認で requirements.revision を同時変更 → 拒否', { mutate: { project: { 'requirements.status': 'approved', 'requirements.approvedAt': serverTimestamp(), 'requirements.approvedBy': 'client1', 'requirements.approvalId': 'requirements-r1-approve', 'requirements.revision': 5, ...stamp('client1') } } });
  deny('承認と同時に案件の基本情報を変える → 拒否', { mutate: { project: { 'requirements.status': 'approved', 'requirements.approvedAt': serverTimestamp(), 'requirements.approvedBy': 'client1', 'requirements.approvalId': 'requirements-r1-approve', siteName: '変更', ...stamp('client1') } } });
  test('SEC-6 / M-8: token.email を変えたお客様（ログも新しいメール）→ 拒否', async () => {
    await seed(env, { reqState: 'analyzed' });
    const db = dbAs(env, 'client1', { email: 'changed@customer.example' });
    await assertFails(approveBatch(db, { mutate: { log: { ...ok, actorEmail: 'changed@customer.example' } } }));
  });
  test('お客様は approved を draft・analyzed に戻せない', async () => {
    await seed(env, { reqState: 'approved' });
    const db = dbAs(env, 'client1');
    await assertFails(updateDoc(doc(db, 'projects/p1'), { 'requirements.status': 'analyzed', ...stamp('client1') }));
    await assertFails(updateDoc(doc(db, 'projects/p1'), { 'requirements.status': 'draft', ...stamp('client1') }));
  });
});

describe('M-3 / SEC-3: 開発者が承認の記録・状態を作る', () => {
  test('開発者が status: approved へ更新（ログ付き）→ 拒否', async () => {
    await seed(env, { reqState: 'analyzed' });
    const db = dbAs(env, 'devA');
    await assertFails(approveBatch(db, { uid: 'devA', mutate: { log: { ...approvalDoc('devA', 'approve', 1, { answers: ANSWERS, proposal: PROPOSAL }), side: 'client' } } }));
  });
  test('開発者が status: approved へ直接更新 → 拒否', async () => {
    await seed(env, { reqState: 'analyzed' });
    await assertFails(updateDoc(doc(dbAs(env, 'devA'), 'projects/p1'), { 'requirements.status': 'approved', ...stamp('devA') }));
  });
  test('開発者が draft から approved へ（submit を飛ばす）→ 拒否', async () => {
    await seed(env);
    await assertFails(submitBatch(dbAs(env, 'devA'), { mutate: { project: { requirements: { status: 'approved', revision: 1, analyzedAt: serverTimestamp() }, ...stamp('devA') } } }));
  });
  test("開発者が action:'approve' / side:'client' の記録だけ作る → 拒否", async () => {
    await seed(env, { reqState: 'analyzed' });
    const db = dbAs(env, 'devA');
    await assertFails(setDoc(doc(db, 'projects/p1/approvals/requirements-r1-approve'), { ...approvalDoc('devA', 'approve', 1, { answers: ANSWERS, proposal: PROPOSAL }), side: 'client' }));
    await assertFails(setDoc(doc(db, 'projects/p1/approvals/requirements-r1-approve'), approvalDoc('devA', 'approve', 1, { answers: ANSWERS, proposal: PROPOSAL })));
  });
  test('開発者が approved の案件の requirements を書き換える → 拒否', async () => {
    await seed(env, { reqState: 'approved' });
    await assertFails(updateDoc(doc(dbAs(env, 'devA'), 'projects/p1'), { 'requirements.status': 'draft', ...stamp('devA') }));
    await assertFails(updateDoc(doc(dbAs(env, 'devA'), 'projects/p1'), { 'requirements.approvedBy': 'devA', ...stamp('devA') }));
  });
});

describe('approvals: 読み取りと追記のみ', () => {
  test('admin・アサインされた開発者・担当のお客様は読める・一覧できる', async () => {
    await seed(env, { reqState: 'approved' });
    for (const uid of ['admin1', 'devA', 'client1']) {
      const db = dbAs(env, uid);
      await assertSucceeds(getDoc(doc(db, 'projects/p1/approvals/requirements-r1-approve')));
      await assertSucceeds(getDocs(query(collection(db, 'projects/p1/approvals'), orderBy('at', 'desc'), limit(50))));
    }
  });
  test('アサイン外の開発者・他案件のお客様は読めない', async () => {
    await seed(env, { reqState: 'approved' });
    await assertFails(getDoc(doc(dbAs(env, 'devC'), 'projects/p1/approvals/requirements-r1-approve')));
    await assertFails(getDocs(collection(dbAs(env, 'client2'), 'projects/p1/approvals')));
  });
  test('collectionGroup の横断一覧は admin だけ', async () => {
    await seed(env, { reqState: 'approved' });
    await assertSucceeds(getDocs(query(collectionGroup(dbAs(env, 'admin1'), 'approvals'), orderBy('at', 'desc'), limit(20))));
    await assertFails(getDocs(query(collectionGroup(dbAs(env, 'devA'), 'approvals'), limit(20))));
    await assertFails(getDocs(query(collectionGroup(dbAs(env, 'client1'), 'approvals'), limit(20))));
  });
  test('承認ログの update・delete は admin を含む全員が拒否', async () => {
    await seed(env, { reqState: 'approved' });
    for (const uid of ['admin1', 'devA', 'client1']) {
      const db = dbAs(env, uid);
      await assertFails(updateDoc(doc(db, 'projects/p1/approvals/requirements-r1-approve'), { actorName: '改ざん' }));
      await assertFails(deleteDoc(doc(db, 'projects/p1/approvals/requirements-r1-approve')));
      await assertFails(setDoc(doc(db, 'projects/p1/approvals/requirements-r1-approve'), { at: T0 }));
    }
  });
});
