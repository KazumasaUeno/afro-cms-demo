import type { DemoState } from '@/types';
import { REQUIREMENT_CATEGORIES, REQUIREMENT_QUESTIONS } from '@/data/requirements';
import { formatDateTime } from '@/services/time';
import { downloadText } from '@/services/download';
import { buildProposal } from './buildProposal';
import { answerText, isAnswered } from './validation';

/**
 * 要件定義書（印刷できる HTML）。改善提案（buildProposal）とヒアリングの全回答を 1 枚にまとめる。
 * 画面と同じく回答から毎回作る（別に保存しない）。ブラウザで開いて印刷すると PDF にもできる。
 */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const PRIORITY = { high: '優先度 高', medium: '優先度 中', low: '優先度 低' } as const;

export function buildRequirementsDocHtml(state: Pick<DemoState, 'requirements' | 'projects'>): string {
  const req = state.requirements;
  const project = state.projects.find((p) => p.id === req.projectId);
  const proposal = buildProposal(req.answers, req.competitors);
  const status = req.status === 'approved' ? `承認済み（${formatDateTime(req.approvedAt)}）` : req.status === 'analyzed' ? 'お客様の承認待ち' : '作成中（AI 分析前）';
  const answers = REQUIREMENT_CATEGORIES.map((c) => {
    const qs = REQUIREMENT_QUESTIONS.filter((q) => q.categoryId === c.id);
    if (!qs.length) return '';
    const rows = qs.map((q) => {
      const v = req.answers[q.id];
      return `<tr><th>${esc(q.text)}</th><td>${isAnswered(v) ? esc(answerText(v)).replace(/\n/g, '<br>') : '<span class="muted">未回答</span>'}</td></tr>`;
    }).join('');
    return `<h3>${c.no}. ${esc(c.title)}</h3><table>${rows}</table>`;
  }).join('');
  const points = proposal.points.map((p) => `<li><b>[${PRIORITY[p.priority]}] ${esc(p.area)}: ${esc(p.title)}</b><br>${esc(p.detail)}<br><span class="muted">${esc(p.impact)}</span></li>`).join('');
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>要件定義書 ${esc(project?.siteName ?? proposal.hostname)}</title>
<style>
body{font-family:"Noto Sans JP",sans-serif;max-width:820px;margin:32px auto;padding:0 16px;color:#0f172a;line-height:1.7;font-size:14px}
h1{font-size:24px;margin:0 0 4px}h2{font-size:18px;margin:28px 0 8px;padding-bottom:4px;border-bottom:2px solid #0f172a}h3{font-size:15px;margin:18px 0 6px}
table{width:100%;border-collapse:collapse;margin-bottom:8px}th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:left;vertical-align:top}th{width:42%;background:#f4f5f8;font-weight:600}
.muted{color:#64748b}.note{background:#FEF5E3;padding:8px 12px;border-radius:8px}dl{display:grid;grid-template-columns:140px 1fr;gap:4px 12px;margin:12px 0}dt{color:#64748b}dd{margin:0}
@media print{.note{display:none}body{margin:0}h2,h3{break-after:avoid}tr{break-inside:avoid}}
</style></head><body>
<p class="note"><b>デモデータ</b>：アフロCMSデモが作成したサンプルです。印刷（PDF 保存）するとこの注記は出ません。</p>
<h1>要件定義書</h1>
<dl>
<dt>お客様</dt><dd>${esc(project?.clientName ?? '')}</dd>
<dt>サイト</dt><dd>${esc(project?.siteName ?? '')}（${esc(proposal.hostname)}）</dd>
<dt>状態</dt><dd>${esc(status)}</dd>
<dt>AI 分析</dt><dd>${esc(formatDateTime(req.analyzedAt))}</dd>
<dt>出力</dt><dd>${esc(formatDateTime(new Date().toISOString()))}</dd>
</dl>
<h2>1. 改善提案</h2>
${proposal.issue ? `<p><b>課題</b>：${esc(proposal.issue)}</p>` : ''}
<p>サイトスコア（AI 推定・デモ用の値）：現状 ${proposal.currentScore} → 改善後の見込み ${proposal.projectedScore}</p>
${proposal.competitors.length ? `<p>競合サイト：${esc(proposal.competitors.join('・'))}</p>` : ''}
<ol>${points}</ol>
<h2>2. ヒアリングの回答</h2>
${answers}
</body></html>`;
}

export function downloadRequirementsDoc(state: Pick<DemoState, 'requirements' | 'projects'>): void {
  const host = buildProposal(state.requirements.answers, state.requirements.competitors).hostname;
  downloadText(`requirements-${host}-${new Date().toISOString().slice(0, 10)}.html`, buildRequirementsDocHtml(state), 'text/html;charset=utf-8');
}
