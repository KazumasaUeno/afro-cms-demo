// お客様ポータルの確認・承認のサイトマップの区画（LIVE_SITEMAP_IMPL_PLAN U4。src/live/portalSitemap.ts・SitemapApprovalSection）と
// approvalSteps の designAvailable（P-10: live のトップデザインの段は locked のまま）。
// 純関数は直接 import（React・Firebase を読まない）。区画の描画は tsxBundle で renderToStaticMarkup（SM-26: 文字列が要素にならない）。
// 実行: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clientSitemapShown, clientSitemapState, clientSitemapStep, sitemapApproveBlock, sitemapGateSchedule, SITEMAP_ADJUSTING_TEXT } from '../../src/live/portalSitemap.ts';
import { clientSitemapView, SITEMAP_CONFLICT_TEXT } from '../../src/live/sitemap.ts';
import { liveProjectView } from '../../src/live/projectView.ts';
import { approvalSteps } from '../../src/features/portal/portalSteps.ts';
import { importTsxSource } from './tsxBundle.mjs';

const XSS = '<img src=x onerror=alert(1)>';
const node = (id, label, kind = 'keep', reason) => ({ id, type: 'page', position: { x: 0, y: 0 }, data: { label, kind, ...(reason ? { reason } : {}) } });
const version = (over = {}) => ({
  revision: 2,
  before: { nodes: [node('b1', 'トップ')], edges: [] },
  after: { nodes: [node('a1', 'トップ'), node('a2', `料金${XSS}`, 'new', `理由${XSS}`)], edges: [] },
  devComment: { text: `意図${XSS}`, at: '2026-12-01T01:00:00.000Z', byName: '黒田' },
  origin: 'manual', contentHash: 'h2', submittedAt: '2026-12-01T02:00:00.000Z',
  ...over,
});
const summary = (over = {}) => ({ status: 'requested', revision: 2, requestedAt: '2026-12-01T02:00:00.000Z', contentHash: 'h2', ...over });
const schedApproved = { status: 'approved', revision: 1, approvedRevision: 1, approvedAt: '2026-11-30T00:00:00.000Z' };
const project = { id: 'p1', siteName: 'S', clientName: 'C', stage: 'sitemap', projectId: 'p1' };
const req = { projectId: 'p1', status: 'approved', answers: {}, approvedAt: '2026-11-29T00:00:00.000Z', analyzedAt: '2026-11-28T00:00:00.000Z' };
const work = (over = {}) => ({ sitemap: { before: { nodes: [], edges: [] }, after: { nodes: [], edges: [] } }, design: { selected: null }, qualityChecks: {}, pages: [], diagnoses: [], signage: [], ...over });

/** 画面と同じ組み立て（PortalApprovalPage の SitemapApproval） */
function stepOf(sum, ver, sched = schedApproved, w = work()) {
  const cv = clientSitemapView(sum, ver);
  const view = liveProjectView(project, req, [], w, sitemapGateSchedule(sched), clientSitemapState(cv, sum));
  const base = approvalSteps(view, { designAvailable: false }).find((s) => s.key === 'sitemap');
  return { cv, view, ...clientSitemapStep(base, cv) };
}

test('段階: 未作成・下書きは準備中／依頼中は承認待ち（依頼の日時つき）／承認済み（代理の表記）／調整中は前回承認の版を locked のまま見せる', () => {
  // 未作成（要約なし）・スケジュール未承認
  assert.equal(stepOf(null, null, null).step.status, 'locked');
  assert.equal(stepOf(null, null).step.status, 'locked');
  // 下書き（承認歴なし）: 版を読まない＝準備中・中身なし
  const draft = stepOf(summary({ status: 'draft' }), null);
  assert.equal(draft.cv.kind, 'none');
  assert.equal(draft.step.status, 'locked');
  assert.equal(draft.keepWhenLocked, undefined);
  // 依頼中
  const r = stepOf(summary(), version());
  assert.equal(r.step.status, 'waiting');
  assert.equal(r.step.requestedAt, '2026-12-01T02:00:00.000Z');
  assert.equal(r.view.sitemap.after.nodes.length, 2);
  assert.equal(r.view.sitemap.devComment.by, '黒田');
  assert.equal(r.approvedLabel, '承認済み');
  // 依頼中だが読めた版の番号が違う（取り下げ直後など）→ 出さない
  assert.equal(stepOf(summary({ revision: 3 }), version()).step.status, 'locked');
  // 承認済み（代理）
  const ap = stepOf(summary({ status: 'approved', approvedRevision: 2, approvedAt: '2026-12-02T00:00:00.000Z', approvedVia: 'proxy' }), version());
  assert.equal(ap.step.status, 'approved');
  assert.equal(ap.step.approvedAt, '2026-12-02T00:00:00.000Z');
  assert.equal(ap.approvedLabel, '代理で承認済み');
  // 調整中（承認の後に下書きへ戻った）: 前回承認の版
  const adj = stepOf(summary({ status: 'draft', approvedRevision: 2, approvedAt: '2026-12-02T00:00:00.000Z' }), version());
  assert.equal(adj.step.status, 'locked');
  assert.equal(adj.keepWhenLocked, true);
  assert.equal(adj.step.lockedReason, SITEMAP_ADJUSTING_TEXT);
  assert.equal(adj.view.sitemap.after.nodes.length, 2);
});

test('承認の対象は表示した版の revision・contentHash（P-3）。依頼中でない・アーカイブ・ハッシュなしは押せない', () => {
  assert.deepEqual(clientSitemapShown(clientSitemapView(summary(), version()), false), { revision: 2, contentHash: 'h2' });
  assert.equal(clientSitemapShown(clientSitemapView(summary(), version()), true), null);
  assert.equal(clientSitemapShown(clientSitemapView(summary(), version({ contentHash: '' })), false), null);
  assert.equal(clientSitemapShown(clientSitemapView(summary({ status: 'approved', approvedRevision: 2 }), version()), false), null);
  assert.equal(clientSitemapShown({ kind: 'none' }, false), null);
});

test('確認の間に版が変わったら送らない（AC-09・「内容が変わりました」）', () => {
  const shown = { revision: 2, contentHash: 'h2' };
  assert.equal(sitemapApproveBlock(shown, summary()), null);
  assert.equal(sitemapApproveBlock(shown, summary({ revision: 3 })), SITEMAP_CONFLICT_TEXT.approve);
  assert.equal(sitemapApproveBlock(shown, summary({ contentHash: 'h3' })), SITEMAP_CONFLICT_TEXT.approve);
  assert.equal(sitemapApproveBlock(shown, null), SITEMAP_CONFLICT_TEXT.approve);
  assert.equal(SITEMAP_CONFLICT_TEXT.approve, '内容が変わりました。最新を読み込みました');
});

test('お客様の state は版文書だけから組む（internal を渡さない）', () => {
  const st = clientSitemapState(clientSitemapView(summary(), version()), summary());
  assert.equal(st.requestedAt, '2026-12-01T02:00:00.000Z');
  assert.equal(st.sitemap.after.nodes[1].data.label, `料金${XSS}`);
  assert.equal(clientSitemapState({ kind: 'none' }, summary()), null);
  assert.equal(sitemapGateSchedule(null), null);
  assert.equal(sitemapGateSchedule({ status: 'draft', revision: 1 }), null);
  assert.ok(sitemapGateSchedule({ status: 'draft', revision: 2, approvedRevision: 1, approvedAt: 'x' }).schedule.approvedAt);
});

test('P-10: live（designAvailable:false）のトップデザインは承認済みでなければ locked（依頼待ちにもしない）。demo（既定）は不変', () => {
  const approvedSite = { before: { nodes: [], edges: [] }, after: { nodes: [node('a', 'トップ')], edges: [] }, approvedAt: '2026-12-02T00:00:00.000Z' };
  const base = liveProjectView(project, req, [], work({ sitemap: approvedSite }), sitemapGateSchedule(schedApproved), null);
  const design = (state, opts) => approvalSteps(state, opts).find((s) => s.key === 'design');
  // demo: サイトマップ承認後・未依頼 → 依頼待ち（awaitingRequest）、依頼あり → 承認待ち
  assert.equal(design(base).awaitingRequest, true);
  const asked = { ...base, approvalRequests: { ...base.approvalRequests, design: '2026-12-03T00:00:00.000Z' } };
  assert.equal(design(asked).status, 'waiting');
  assert.deepEqual(approvalSteps(asked), approvalSteps(asked, {}));
  // live: どちらも locked・依頼待ちにしない
  for (const s of [base, asked]) {
    const d = design(s, { designAvailable: false });
    assert.equal(d.status, 'locked');
    assert.equal(d.awaitingRequest, undefined);
    assert.equal(d.requestedAt, undefined);
    assert.equal(d.no, 4);
  }
  // 段は隠さない（番号と並びは demo と同じ）・他の段は同じ
  assert.deepEqual(approvalSteps(asked, { designAvailable: false }).map((s) => s.key), approvalSteps(asked).map((s) => s.key));
  assert.deepEqual(approvalSteps(asked, { designAvailable: false }).filter((s) => s.key !== 'design'), approvalSteps(asked).filter((s) => s.key !== 'design'));
  // 承認済みはそのまま
  const done = { ...asked, design: { selected: 'a', approvedAt: '2026-12-04T00:00:00.000Z' } };
  assert.equal(design(done, { designAvailable: false }).status, 'approved');
});

test('SM-26: 区画の描画でページ名・理由・コメントが要素にならず文字として出る。依頼中は承認する・調整中は前回の版と案内', async () => {
  const m = await importTsxSource(`
import { renderToStaticMarkup } from 'react-dom/server';
import { ThemeModeProvider } from '@/theme/ThemeMode';
import { SitemapApprovalSection } from '@/features/portal/PortalApprovalParts';
export const render = (props) => renderToStaticMarkup(<ThemeModeProvider><SitemapApprovalSection {...props} action={<button>承認する</button>} /></ThemeModeProvider>);
`);
  const store = new Map();
  globalThis.window = { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }), localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) } };
  const origError = console.error;
  console.error = () => {};
  try {
    const r = stepOf(summary(), version());
    const html = m.render({ step: r.step, sitemap: r.view.sitemap, approvedLabel: r.approvedLabel });
    assert.ok(!/<img/i.test(html), 'img 要素が出ている');
    assert.ok(html.includes('料金&lt;img src=x onerror=alert(1)&gt;'));
    assert.ok(html.includes('理由&lt;img src=x onerror=alert(1)&gt;'));
    assert.ok(html.includes('意図&lt;img src=x onerror=alert(1)&gt;'));
    assert.ok(html.includes('開発担当者より'));
    assert.ok(html.includes('承認する'));
    assert.ok(html.includes('リニューアル後は'));

    const ap = stepOf(summary({ status: 'approved', approvedRevision: 2, approvedAt: '2026-12-02T00:00:00.000Z', approvedVia: 'proxy' }), version());
    const apHtml = m.render({ step: ap.step, sitemap: ap.view.sitemap, approvedLabel: ap.approvedLabel });
    assert.ok(apHtml.includes('代理で承認済み'));
    assert.ok(!apHtml.includes('<button>承認する</button>'));

    const adj = stepOf(summary({ status: 'draft', approvedRevision: 2, approvedAt: '2026-12-02T00:00:00.000Z' }), version());
    const adjHtml = m.render({ step: adj.step, sitemap: adj.view.sitemap, approvedLabel: adj.approvedLabel, keepWhenLocked: adj.keepWhenLocked });
    assert.ok(adjHtml.includes(SITEMAP_ADJUSTING_TEXT));
    assert.ok(adjHtml.includes('リニューアル後は'));
    assert.ok(adjHtml.includes('準備中'));

    // 下書き（承認歴なし）: 中身を出さない
    const d = stepOf(summary({ status: 'draft' }), null);
    const dHtml = m.render({ step: d.step, sitemap: d.view.sitemap, approvedLabel: d.approvedLabel });
    assert.ok(dHtml.includes('準備中'));
    assert.ok(!dHtml.includes('リニューアル後は'));
  } finally {
    console.error = origError;
    delete globalThis.window;
  }
});
