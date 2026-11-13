import type { Asset, CmsPage, DemoState, PageSnapshot, PageVersion, PageVersionKind } from '@/types';
import { assetSrc } from './assets';

/**
 * ページの履歴（0.35.0。案件ごと・ページごと。2026-11-13 ユーザー指示）。
 * ページの保存・承認依頼・予約公開・公開・公開の取り消しのたびに 1 件残す（reducer）。内容が直前の版と同じなら内容は持たない。
 * 素材ドライブの画像は版の中では「asset:<id>」（見本は「asset-preset:<id>」）に置き換え、画像データを版ごとに写さない（容量を守るため）。
 * 比較・復元のときに素材ドライブから戻す（素材が消えていればその画像は外す）。
 * 復元はエディタに読み込むだけで、ページの状態・公開中の内容は変えない（保存すると「復元」の版が残る）
 */
export const HISTORY_MAX_ENTRIES = 15;
export const HISTORY_MAX_SNAPS = 8;

export const VERSION_LABEL: Record<PageVersionKind, string> = {
  create: '作成', save: '保存', restore: '復元して保存', review: '承認依頼', schedule: '予約公開', publish: '公開', unpublish: '公開の取り消し',
};

const NO_HISTORY: PageVersion[] = [];
export const historyOf = (state: Pick<DemoState, 'pageHistory'>, pageId: string): PageVersion[] => state.pageHistory?.[pageId] ?? NO_HISTORY;

const token = (a: Asset) => (a.preset ? `asset-preset:${a.preset}` : `asset:${a.id}`);

/** 版に残す内容（素材ドライブの画像は参照に置き換える） */
export function snapshotOf(page: Pick<CmsPage, 'title' | 'content' | 'seoTitle' | 'seoDescription' | 'coverImage'>, assets: Asset[]): PageSnapshot {
  let content = page.content;
  let coverImage = page.coverImage;
  for (const a of assets) {
    const src = assetSrc(a);
    if (!src) continue;
    if (content.includes(src)) content = content.split(src).join(token(a));
    if (coverImage === src) coverImage = token(a);
  }
  return { title: page.title, content, seoTitle: page.seoTitle, seoDescription: page.seoDescription, ...(coverImage ? { coverImage } : {}) };
}

const REF = /^asset(-preset)?:([\w-]+)$/;
function resolveRef(ref: string, assets: Asset[]): string | undefined {
  const m = REF.exec(ref);
  if (!m) return ref;
  const a = m[1] ? assets.find((x) => x.preset === m[2]) ?? { preset: m[2] } : assets.find((x) => x.id === m[2]);
  return a ? assetSrc(a) : undefined;
}

/** 版の内容を表示・復元できる形へ戻す（参照を素材の画像へ。見つからない画像は外す） */
export function resolveSnapshot(snap: PageSnapshot, assets: Asset[]): PageSnapshot {
  const content = snap.content.replace(/<img\b[^>]*?\bsrc="(asset(?:-preset)?:[\w-]+)"[^>]*>/g, (tag, ref: string) => {
    const src = resolveRef(ref, assets);
    return src ? tag.replace(ref, src) : '';
  });
  const coverImage = snap.coverImage ? resolveRef(snap.coverImage, assets) : undefined;
  return { ...snap, content, ...(coverImage ? { coverImage } : { coverImage: undefined }) };
}

export const sameSnap = (a: PageSnapshot, b: PageSnapshot): boolean =>
  a.title === b.title && a.content === b.content && a.seoTitle === b.seoTitle && a.seoDescription === b.seoDescription && (a.coverImage ?? '') === (b.coverImage ?? '');

/** その版の時点の内容（その版に無ければ、それより古い一番近い版の内容） */
export function snapAt(versions: PageVersion[], index: number): PageSnapshot | undefined {
  for (let i = index; i < versions.length; i++) if (versions[i].snap) return versions[i].snap;
  return undefined;
}

/** 件数の上限（全体 15 件・内容つき 8 件）を超えた古い記録を落とす */
function capped(list: PageVersion[]): PageVersion[] {
  let out = list.slice(0, HISTORY_MAX_ENTRIES);
  let snaps = 0;
  const cut = out.findIndex((v) => (v.snap ? ++snaps > HISTORY_MAX_SNAPS : false));
  if (cut >= 0) out = out.slice(0, cut);
  return out;
}

/**
 * 履歴に 1 件足した pageHistory。保存（save）で内容が変わっていなければ足さない。
 * 状態の変更（承認依頼・公開など）は内容が同じでも、誰が・いつを残す（内容は持たない）
 */
export function withVersion(
  history: Record<string, PageVersion[]> | undefined, page: CmsPage, kind: PageVersionKind, by: string, at: string, id: string, assets: Asset[],
): Record<string, PageVersion[]> | undefined {
  const list = history?.[page.id] ?? [];
  const snap = snapshotOf(page, assets);
  const latest = snapAt(list, 0);
  const changed = !latest || !sameSnap(latest, snap);
  if (!changed && kind === 'save') return history;
  const entry: PageVersion = { id, at, by, kind, ...(changed ? { snap } : {}) };
  return { ...(history ?? {}), [page.id]: capped([entry, ...list]) };
}

export function withoutPage(history: Record<string, PageVersion[]> | undefined, pageId: string): Record<string, PageVersion[]> | undefined {
  if (!history?.[pageId]) return history;
  const rest = { ...history };
  delete rest[pageId];
  return rest;
}
