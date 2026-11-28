import type { SitemapEdge, SitemapNode, SitemapState, SitemapVariant } from '@/types';
import type { SitemapDiagram, SitemapStatus } from '@/live/sitemap';
import { aiCanGenerate, type AiFlagMode } from '@/features/requirements/aiDraft/aiDraftState';

/**
 * live のサイトマップ画面（LIVE_SITEMAP_IMPL_PLAN U3-b）の判定と文言。純関数だけ（React・Firebase を import しない。tests/unit/liveSitemapUi.test.mjs が直接読む）。
 * 権限の実体は firestore.rules と callable。ここは表示の出し分けだけ
 */

export type SitemapViewerRole = 'admin' | 'developer' | 'client';

/* ---------- 手元の値の重ね（保存の echo で編集が巻き戻らないように） ---------- */

/** 図の比較用の署名（ノードの順・座標・名前・パス・種類・理由・接続。キーの順や undefined の有無に左右されない） */
export function sitemapSig(d: { before: SitemapDiagram; after: SitemapDiagram; devText?: string }): string {
  const g = (x: SitemapDiagram) => [
    x.nodes.map((n) => [n.id, Math.round(n.position.x), Math.round(n.position.y), n.data.label, n.data.path, n.data.kind, n.data.reason ?? '']),
    x.edges.map((e) => [e.id, e.source, e.target]),
  ];
  return JSON.stringify([g(d.before), g(d.after), (d.devText ?? '').trim()]);
}

/**
 * 手元の値（overlay）をどうするか。
 * - conflict（ほかの人が先に保存）: 捨てて最新を出す
 * - 保存の待ち・送信中（idle でない）／保存の失敗が残っている: 重ねたまま（書けていない編集を消さない）
 * - 書き終わって中身が届いた値と同じ: 捨てる
 * - 書き終わったが届いた値がまだ古い: 少し待ってから捨てる（grace。届けば同じになって捨てる）
 */
export function sitemapOverlayAction(o: { hasLocal: boolean; idle: boolean; error: boolean; conflict: boolean; equal: boolean }): 'none' | 'keep' | 'drop' | 'grace' {
  if (!o.hasLocal) return 'none';
  if (o.conflict) return 'drop';
  if (!o.idle || o.error) return 'keep';
  return o.equal ? 'drop' : 'grace';
}

/** 1 つの図（variant）の編集を、いま出している中身に重ねて、保存する中身を作る（もう一方の図とコメントは表示中の値のまま） */
export function sitemapEditsWith(shown: SitemapState, variant: SitemapVariant, nodes: SitemapNode[], edges: SitemapEdge[]) {
  return {
    before: variant === 'before' ? { nodes, edges } : shown.before,
    after: variant === 'after' ? { nodes, edges } : shown.after,
    devComment: { text: shown.devComment?.text ?? '' },
  };
}

/* ---------- 状態と操作の出し分け ---------- */

export interface SitemapLiveFlags {
  role: SitemapViewerRole;
  archived: boolean;
  reqApproved: boolean;
  /** 要約の状態（null＝まだ作っていない） */
  status: SitemapStatus | null;
  aiRunning: boolean;
  /** お客様に出している版を読めた（代理承認はその版の revision・contentHash で送る） */
  hasVersion: boolean;
  aiMode: AiFlagMode;
}

export interface SitemapLiveButtons {
  /** 手で作る（none のとき） */
  createManual: boolean;
  /** AI で作る（none）・作り直す（draft）。フラグ（表示だけ。サーバーが正）と役割で出す */
  aiCreate: boolean;
  aiRegenerate: boolean;
  /** 承認を依頼する（draft） */
  request: boolean;
  /** 依頼を取り下げる（requested。OQ-N4: 直すときは取り下げてから） */
  withdraw: boolean;
  /** 代理で承認（requested・管理者だけ） */
  proxy: boolean;
  /** 下書きに戻す（approved。OQ-N1: 理由必須） */
  reopen: boolean;
}

export function sitemapLiveButtons(f: SitemapLiveFlags): SitemapLiveButtons {
  const afro = f.role === 'admin' || f.role === 'developer';
  const act = afro && !f.archived && f.reqApproved;
  const ai = act && aiCanGenerate(f.aiMode, f.role, afro);
  return {
    createManual: act && f.status === null && !f.aiRunning,
    aiCreate: ai && f.status === null && !f.aiRunning,
    aiRegenerate: ai && f.status === 'draft' && !f.aiRunning,
    request: act && f.status === 'draft' && !f.aiRunning,
    withdraw: act && f.status === 'requested',
    proxy: f.role === 'admin' && !f.archived && f.reqApproved && f.status === 'requested' && f.hasVersion,
    reopen: act && f.status === 'approved',
  };
}

/** 閲覧だけのときの注記（編集できるときは null）。demo の「お客様が承認済みのため編集できません」と同じ場所に出す */
export function sitemapLockedNote(f: Pick<SitemapLiveFlags, 'role' | 'archived' | 'reqApproved' | 'status' | 'aiRunning'>): string | null {
  if (f.archived) return 'アーカイブ中のプロジェクトのため、サイトマップは見るだけです';
  if (f.role !== 'admin' && f.role !== 'developer') return 'サイトマップを変更できるのは、担当の開発者と管理者だけです';
  if (!f.reqApproved) return '要件定義書の承認の後に編集できます';
  if (f.aiRunning) return 'AI が下書きを作成している間は編集できません';
  if (f.status === 'requested') return 'お客様の承認待ちのため編集できません。直すときは依頼を取り下げてください';
  if (f.status === 'approved') return 'お客様が承認済みのため編集できません';
  return null;
}

/** ページの説明（demo の 3 つの文言に、依頼中の 1 つを足す） */
export function sitemapLiveDescription(status: SitemapStatus | null, created: boolean): string {
  if (!created) return '要件定義書の承認のあとに、要件定義から改善後のサイト構造を作成します。';
  if (status === 'approved') return '現在のサイトと、要件定義から導いた改善後の構造を切り替えて比較できます。お客様の承認後は閲覧だけできます。';
  if (status === 'requested') return '現在のサイトと、要件定義から導いた改善後の構造を切り替えて比較できます。お客様の承認待ちの間は閲覧だけできます。';
  return '現在のサイトと、要件定義から導いた改善後の構造を切り替えて比較できます。ページの追加・移動・接続はそのまま保存されます。';
}

/* ---------- AI の下書き ---------- */

/** AI の状態（生成中は工程だけ・秒数は出さない。失敗は再試行と手で作る） */
export function sitemapAiPhase(ai: { running: boolean; failed: boolean } | null): 'idle' | 'running' | 'failed' {
  if (ai?.running) return 'running';
  if (ai?.failed) return 'failed';
  return 'idle';
}

export const SITEMAP_AI_TEXT = {
  running: 'AI がサイトマップの下書きを作成しています。承認済みの要件定義書と現在のサイトを読み、改善後の構成を組み立てます。終わるとこの画面に表示されます。',
  failed: 'AI での作成ができませんでした。もう一度試すか、手で作成してください。',
  kept: 'AI の下書きは、作成中にサイトマップが編集されたため反映していません。いまの内容はそのままです。',
  external: '【下書きの文言】承認済みの要件定義書の内容（個人名・メール・電話・URL の一部を除く）と現在のサイトのページ構成を、外部の AI サービス（Anthropic 社・米国。処理は国外）へ送ります。要件定義書に個人名が書かれていると、そのまま送られます。',
  regenerateConfirm: 'いまの下書き（編集した内容を含む）を、AI が新しく作った下書きに置き換えます。元に戻せません。',
  fromRequirements: '要件定義書の案から作成しました。お客様の承認後は、このサイトマップがページ構成の正になります（要件定義書は変わりません）。',
  badgeTooltip: 'AI が要件定義書と現在のサイトから作った案です。担当者が確認・編集してからお客様へ出します。',
} as const;

/* ---------- 案件詳細の「次に必要な作業」（AC-28） ---------- */

/** スケジュールの承認後は、サイトマップの段階の作業（それ以外は従来の値＝fallback） */
export function liveSitemapNext(
  o: { reqApproved: boolean; scheduleApproved: boolean; status: SitemapStatus | null; sitemapTo: string },
  fallback: { label: string; to: string },
): { label: string; to: string } {
  if (!o.reqApproved || !o.scheduleApproved) return fallback;
  const label = o.status === null ? 'サイトマップを作成する'
    : o.status === 'draft' ? 'サイトマップの承認を依頼する'
      : o.status === 'requested' ? 'お客様のサイトマップ承認を待つ'
        : 'サイトマップを確認する（デザインは準備中）';
  return { label, to: o.sitemapTo };
}
