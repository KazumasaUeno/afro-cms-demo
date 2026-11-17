import type { DemoState, ProjectSchedule } from '@/types';
import { REQUIREMENT_CATEGORIES, REQUIREMENT_QUESTIONS } from '@/data/requirements';
import { formatDateTime } from '@/services/time';
import { ymdToIso } from '@/features/projects/projectForm';
import { downloadText } from '@/services/download';
import { buildProposal } from './buildProposal';
import { DATA_MODE } from '@/repositories/mode';
import { answerText, isAnswered } from './validation';

/**
 * 要件定義書（印刷できる HTML）。改善提案（buildProposal）とヒアリングの全回答を 1 枚にまとめる。
 * 画面と同じく回答から毎回作る（別に保存しない）。ブラウザで開いて印刷すると PDF にもできる。
 */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const DEMO_NOTE = '<p class="note"><b>デモデータ</b>：アフロCMSデモが作成したサンプルです。印刷（PDF 保存）するとこの注記は出ません。</p>\n';

const PRIORITY = { high: '優先度 高', medium: '優先度 中', low: '優先度 低' } as const;

/** 要件定義書に入れる state（schedule はその案件の日程。live・日程の無い案件は無い） */
export type RequirementsDocState = Pick<DemoState, 'requirements' | 'projects'> & { schedule?: ProjectSchedule };

/** yyyy-mm-dd を「2026年11月17日」の形に（読めなければそのまま） */
const ymdText = (ymd: string) => {
  const iso = ymdToIso(ymd);
  return iso ? new Date(iso).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }) : ymd;
};

/**
 * 3. スケジュール（2026-11-17 会議）。日程は要件定義書の承認の後に開発担当者が入れるので、無ければその旨を書く
 */
function scheduleSection(s: ProjectSchedule | undefined): string {
  if (!s) return '<p class="muted">要件定義の承認後に開発担当者が入力します。</p>';
  return `<table>
<tr><th>制作完了目安</th><td>${s.buildDue ? esc(ymdText(s.buildDue)) : '<span class="muted">未定</span>'}</td></tr>
<tr><th>品質管理・納品検収の終了日（納品予定日）</th><td>${esc(ymdText(s.deliveryDate))}</td></tr>
<tr><th>公開日（予定）</th><td>${esc(ymdText(s.releaseDate))}</td></tr>
${s.note ? `<tr><th>備考</th><td>${esc(s.note).replace(/\n/g, '<br>')}</td></tr>` : ''}
</table>
<p class="muted">日程は予定です。お客様のご確認・素材のご提供の時期により前後することがあります。</p>`;
}

/**
 * 4. 非機能要件（アフロ標準。2026-11-17 会議）。固定のたたき台で、案件ごとに見直す。
 * 数値は目標であって保証ではない（法的な保証・約束の表現は使わない。条件は契約・保守の取り決めで決める）
 */
const NON_FUNCTIONAL: { title: string; rows: [string, string][] }[] = [
  { title: 'ホスティング', rows: [
    ['基盤', 'AWS（Amazon Web Services）上で運用します。リージョン・構成は案件ごとに決めます。'],
  ] },
  { title: 'セキュリティ', rows: [
    ['通信の暗号化', 'すべての通信を TLS（HTTPS）で暗号化します。HTTP でのアクセスは HTTPS へ転送します。'],
    ['管理画面のアクセス制御', '管理画面はログインが必要です。多要素認証（MFA）を有効にし、アカウントは担当者ごとに発行します。'],
    ['権限', '最小権限の原則で、必要な人に必要な権限だけを付けます。担当の変更・退職のときは速やかに権限を外します。'],
    ['OS・ミドルウェアの更新', 'セキュリティ更新を定期的に適用します。緊急度の高いものは優先して対応します。'],
    ['WAF', 'Web アプリケーションファイアウォール（AWS WAF など）で一般的な攻撃を遮断します。'],
    ['バックアップ', 'データとサイトのファイルを自動でバックアップします（目安: 1日1回・7日分を保持。案件ごとに決めます）。'],
  ] },
  { title: '可用性', rows: [
    ['監視', '死活監視・エラー監視を行い、異常を検知したら担当者へ通知します。'],
    ['バックアップと復元', 'バックアップの頻度は上記のとおりです。復元の手順を用意し、定期的に復元できることを確かめます。'],
    ['稼働率', '目標 99.5%（月間・計画メンテナンスを除く）。目標値であり、保証値ではありません。'],
  ] },
  { title: '運用', rows: [
    ['AIサイト診断', '公開後 4 か月ごとに AIサイト診断を自動で実行し、結果と改善提案をお届けします。'],
  ] },
];

function nonFunctionalSection(): string {
  const groups = NON_FUNCTIONAL.map((g) => `<h3>${esc(g.title)}</h3><table>${g.rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>`).join('');
  return `<p class="note-plain">アフロ標準のたたき台（案件ごとに見直し）。記載の数値は目標であり、保証するものではありません。具体的な条件は契約・保守の取り決めで定めます。</p>${groups}`;
}

export function buildRequirementsDocHtml(state: RequirementsDocState): string {
  const req = state.requirements;
  const project = state.projects.find((p) => p.id === req.projectId);
  // live は保存した提案（承認の対象と同じ写し）を使う。保存値は信用せず、点数は数値に直し、文字列はすべて esc() を通す
  const proposal = req.proposal ?? buildProposal(req.answers, req.competitors);
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
  const points = proposal.points.map((p) => `<li><b>[${PRIORITY[p.priority] ?? ""}] ${esc(p.area)}: ${esc(p.title)}</b><br>${esc(p.detail)}<br><span class="muted">${esc(p.impact)}</span></li>`).join('');
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>要件定義書 ${esc(project?.siteName ?? proposal.hostname)}</title>
<style>
body{font-family:"Noto Sans JP",sans-serif;max-width:820px;margin:32px auto;padding:0 16px;color:#0f172a;line-height:1.7;font-size:14px}
h1{font-size:24px;margin:0 0 4px}h2{font-size:18px;margin:28px 0 8px;padding-bottom:4px;border-bottom:2px solid #0f172a}h3{font-size:15px;margin:18px 0 6px}
table{width:100%;border-collapse:collapse;margin-bottom:8px}th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:left;vertical-align:top}th{width:42%;background:#f4f5f8;font-weight:600}
.muted{color:#64748b}.note{background:#FEF5E3;padding:8px 12px;border-radius:8px}.note-plain{background:#f4f5f8;padding:8px 12px;border-radius:8px}dl{display:grid;grid-template-columns:140px 1fr;gap:4px 12px;margin:12px 0}dt{color:#64748b}dd{margin:0}
@media print{.note{display:none}body{margin:0}h2,h3{break-after:avoid}tr{break-inside:avoid}}
</style></head><body>
${DATA_MODE === 'live' ? '' : DEMO_NOTE}<h1>要件定義書</h1>
<dl>
<dt>お客様</dt><dd>${esc(project?.clientName ?? '')}</dd>
<dt>サイト</dt><dd>${esc(project?.siteName ?? '')}（${esc(proposal.hostname)}）</dd>
<dt>状態</dt><dd>${esc(status)}</dd>
<dt>AI 分析</dt><dd>${esc(formatDateTime(req.analyzedAt))}</dd>
<dt>出力</dt><dd>${esc(formatDateTime(new Date().toISOString()))}</dd>
</dl>
<h2>1. 改善提案</h2>
${proposal.issue ? `<p><b>課題</b>：${esc(proposal.issue)}</p>` : ''}
<p>サイトスコア（AI 推定${DATA_MODE === 'live' ? '' : '・デモ用の値'}）：現状 ${Number(proposal.currentScore) || 0} → 改善後の見込み ${Number(proposal.projectedScore) || 0}</p>
${proposal.competitors.length ? `<p>競合サイト：${esc(proposal.competitors.join('・'))}</p>` : ''}
<ol>${points}</ol>
<h2>2. ヒアリングの回答</h2>
${answers}
<h2>3. スケジュール</h2>
${scheduleSection(state.schedule)}
<h2>4. 非機能要件（アフロ標準）</h2>
${nonFunctionalSection()}
</body></html>`;
}

export function downloadRequirementsDoc(state: RequirementsDocState): void {
  const host = (state.requirements.proposal ?? buildProposal(state.requirements.answers, state.requirements.competitors)).hostname.replace(/[^a-zA-Z0-9.-]/g, '_');
  downloadText(`requirements-${host}-${new Date().toISOString().slice(0, 10)}.html`, buildRequirementsDocHtml(state), 'text/html;charset=utf-8');
}
