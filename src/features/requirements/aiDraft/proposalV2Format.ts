/**
 * 提案 v2 の表示用の値と、要件定義書 HTML の「1. 改善提案」の節（画面設計 AI_REQUIREMENTS_UI.md §6）。
 * 純粋関数だけ（React・Firebase・mode.ts を import しない。tests/unit が Node で読む）。
 * - v2 はサイトスコアを持たない・出さない。flags（要確認の数字）は提案に写らないので、ここでも扱わない（計画 HIGH-3）
 * - HTML の文字列はすべて esc() を通す。保存値は信用しない（数は Number() で直す）
 */
import type { Proposal } from '@/types';
import type { ProposalV2, ProposalV2Draft, SiteCheck, SiteCheckItem } from '@/types/aiDraft';
import { evidenceLabel } from './aiDraftState';

export const esc = (s: string) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const PRIORITY_TEXT = { high: '優先度 高', medium: '優先度 中', low: '優先度 低' } as const;

/** 要件定義書の下書きの 7 欄（表示の順） */
export const DRAFT_FIELDS: { key: Exclude<keyof ProposalV2Draft, 'openQuestions'>; label: string }[] = [
  { key: 'goal', label: '目的' },
  { key: 'target', label: 'ターゲット' },
  { key: 'contents', label: 'コンテンツ' },
  { key: 'features', label: '機能' },
  { key: 'nonFunctional', label: '非機能' },
  { key: 'operation', label: '運用' },
  { key: 'schedule', label: 'スケジュール' },
];
export const DRAFT_EMPTY = '（記載なし）';
export const DRAFT_SECTION_TITLE = '要件定義書（下書き）';
export const DRAFT_OPEN_QUESTIONS_TITLE = '未確定事項';
export const SITE_CHECK_TITLE = '現行サイトの基本チェック';
export const SITE_CHECK_OK = '基準内';
export const SITE_CHECK_NG = '要改善';
export const SITE_CHECK_ANSWERS_ONLY = '提案はヒアリングの回答をもとに作成しています。';

/** 基本チェックの値（単位は functions/src/ai/site/checks.ts:70-79） */
export function siteCheckValueText(item: SiteCheckItem): string {
  const v = item.value;
  if (typeof v === 'boolean') return v ? 'あり' : 'なし';
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  switch (item.key) {
    case 'title-length': return Number.isFinite(n) ? `${n}文字` : String(v);
    case 'alt-missing': return Number.isFinite(n) ? `${n}%` : String(v);
    case 'page-size': return Number.isFinite(n) ? `${(n / 1024).toFixed(1)}KB` : String(v);
    case 'response-time': return Number.isFinite(n) ? `${(n / 1000).toFixed(1)}秒` : String(v);
    default: return String(v);
  }
}

/** fetchedAt を「2026/11/24 9:05」の形に（端末の時刻。読めなければ空） */
export function fetchedAtText(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 基本チェックの補足（実測の件数だけ） */
export function siteCheckCaption(sc: SiteCheck): string {
  const at = fetchedAtText(sc.fetchedAt);
  return `${at ? `${at} に取得 ・ ` : ''}${Number(sc.passed) || 0} / ${Number(sc.total) || 0} 項目が基準内`;
}

/** blocked・failed のときの文（ok なら null） */
export function siteCheckUnavailable(sc: SiteCheck): string | null {
  if (sc.status === 'blocked') return `サイト側の設定で取得できなかったため、基本チェックは行っていません。${SITE_CHECK_ANSWERS_ONLY}`;
  if (sc.status === 'failed') return `サイトを取得できなかったため、基本チェックは行っていません。${SITE_CHECK_ANSWERS_ONLY}`;
  return null;
}

const nl = (s: string) => esc(s).replace(/\n/g, '<br>');

/** v1 の「1. 改善提案」の中身（従来の HTML と同じ。showScore は demo だけ） */
export function proposalV1Html(p: Proposal, showScore: boolean): string {
  const points = p.points.map((x) => `<li><b>[${PRIORITY_TEXT[x.priority] ?? ''}] ${esc(x.area)}: ${esc(x.title)}</b><br>${esc(x.detail)}<br><span class="muted">${esc(x.impact)}</span></li>`).join('');
  return `${p.issue ? `<p><b>課題</b>：${esc(p.issue)}</p>` : ''}
${showScore ? `<p>サイトスコア（デモ用の値）：現状 ${Number(p.currentScore) || 0} → 改善後の見込み ${Number(p.projectedScore) || 0}</p>` : ''}
${p.competitors.length ? `<p>競合サイト：${esc(p.competitors.join('・'))}</p>` : ''}
<ol>${points}</ol>`;
}

/** v2 の「1. 改善提案」の中身（サイトスコアは出さない。根拠・基本チェック・要件定義書の下書きを足す） */
export function proposalV2Html(p: ProposalV2): string {
  const points = p.points.map((x) => {
    const ev = Array.isArray(x.evidence) && x.evidence.length ? `<br><span class="muted">根拠：${esc(x.evidence.map(evidenceLabel).join('・'))}</span>` : '';
    return `<li><b>[${PRIORITY_TEXT[x.priority] ?? ''}] ${esc(x.area)}: ${esc(x.title)}</b><br>${nl(x.detail)}<br><span class="muted">${esc(x.impact)}</span>${ev}</li>`;
  }).join('');
  let site = '';
  if (p.siteCheck) {
    const sc = p.siteCheck;
    const un = siteCheckUnavailable(sc);
    site = `<h3>${esc(SITE_CHECK_TITLE)}</h3>${un ? `<p class="muted">${esc(un)}</p>` : `<p class="muted">${esc(siteCheckCaption(sc))}</p><table>${sc.items.map((i) =>
      `<tr><th>${esc(evidenceLabel(i.key))}</th><td>${i.ok ? SITE_CHECK_OK : SITE_CHECK_NG}・${esc(siteCheckValueText(i))}</td></tr>`).join('')}</table>`}`;
  }
  const d = p.draft;
  const rows = DRAFT_FIELDS.map((f) => `<tr><th>${esc(f.label)}</th><td>${d[f.key] ? nl(d[f.key]) : `<span class="muted">${DRAFT_EMPTY}</span>`}</td></tr>`).join('');
  const oq = d.openQuestions.length ? `<h3>${esc(DRAFT_OPEN_QUESTIONS_TITLE)}</h3><ul>${d.openQuestions.map((q) => `<li>${esc(q)}</li>`).join('')}</ul>` : '';
  return `${p.issue ? `<p><b>課題</b>：${esc(p.issue)}</p>` : ''}
${p.summary ? `<p><b>要約</b>：${nl(p.summary)}</p>` : ''}
${p.competitors.length ? `<p>競合サイト：${esc(p.competitors.join('・'))}</p>` : ''}
<ol>${points}</ol>
${site}
<h3>${esc(DRAFT_SECTION_TITLE)}</h3><table>${rows}</table>${oq}`;
}
