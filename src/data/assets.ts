import type { Asset, AssetState, CmsPage, DemoState } from '@/types';
import { hasLiveVersion } from '@/features/cms/cmsUtils';
import { DEMO_IMAGES } from './cms';

/**
 * 素材ドライブ（0.36.0。案件ごと。2026-11-13 ユーザー指示）。
 * 画像はブラウザの中で縮小した JPEG（24KB 以下）だけを保存する（localStorage の容量を守るため。元の画像は保存しない）。
 * 資料（PDF など）は名前・種類・大きさだけ（デモのため中身は保存しない）。
 * 管理（アップロード・名前の変更・削除）は開発者画面だけ。お客様ポータルはページ編集の画像選択で使うだけ、管理者画面は見るだけ。
 */
export const ASSET_LIMITS = {
  /** アップロードできる件数（案件ごと。見本の画像は数えない） */
  uploads: 20,
  /** 画像として受け付ける元のファイルの大きさ */
  imageBytes: 10 * 1024 * 1024,
  docBytes: 10 * 1024 * 1024,
  /** 縮小後の画像（data URL の文字数） */
  thumbChars: 24 * 1024,
  /** 縮小後の長辺（px） */
  thumbEdge: 480,
  name: 60,
  folder: 20,
  /** 保存データ全体（JSON の文字数）。これを超えるアップロードは受け付けない（localStorage はおよそ 5MB） */
  stateChars: 3_000_000,
} as const;

export const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
export const DOC_TYPES: Record<string, string> = {
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel',
  'text/csv': 'CSV',
};
/** ファイル選択の accept */
export const ASSET_ACCEPT = [...IMAGE_MIMES, ...Object.keys(DOC_TYPES), '.csv', '.pdf', '.docx', '.xlsx'].join(',');

const PRESET_AT = '2026-11-01T00:00:00.000Z';
const PRESET_PREFIX = 'asset-preset-';

let presetCache: Asset[] | null = null;
/** 見本の画像（どの案件にも最初から入っている。画像データは保存しない） */
export const presetAssets = (): Asset[] =>
  (presetCache ??= DEMO_IMAGES.map((i) => ({
    id: `${PRESET_PREFIX}${i.id}`, name: i.label, kind: 'image' as const, folder: '見本', mime: 'image/svg+xml', size: i.src.length,
    preset: i.id, createdAt: PRESET_AT, createdBy: 'アフロ',
  })));

/** 選んでいる案件の素材（無い案件は見本の画像 4 点。最初に変えたときに保存する） */
export const assetsOf = (state: Pick<DemoState, 'assets'>): AssetState => state.assets ?? { items: presetAssets() };

/** 表示する画像の src（見本は表示のときに作る。資料は無し） */
export const assetSrc = (a: Pick<Asset, 'preset' | 'src'>): string | undefined =>
  a.preset ? DEMO_IMAGES.find((i) => i.id === a.preset)?.src : a.src;

export const uploadCount = (items: Asset[]): number => items.filter((a) => !a.preset).length;

export interface AssetUse { page: CmsPage; live: boolean }

/**
 * 素材を使っているページ（本文・カバー画像・公開中の内容）。live = 公開中の版で使っている
 * （公開中の内容の本文、または公開中の版があるページのカバー画像）
 */
export function assetUsage(a: Asset, pages: CmsPage[]): AssetUse[] {
  const src = assetSrc(a);
  if (!src) return [];
  return pages
    .filter((p) => p.content.includes(src) || p.coverImage === src || !!p.publishedContent?.includes(src))
    .map((page) => ({ page, live: !!page.publishedContent?.includes(src) || (page.coverImage === src && hasLiveVersion(page)) }));
}

/** 削除できない理由（できるときは null）。公開中の版で使っている素材は消せない（画面と reducer の両方で使う） */
export function assetDeleteBlock(a: Asset, pages: CmsPage[]): string | null {
  const live = assetUsage(a, pages).filter((u) => u.live);
  if (live.length === 0) return null;
  return `公開中のページで使っているため削除できません（${live.map((u) => `「${u.page.title}」`).join('・')}）。ページから外して公開し直すと削除できます`;
}

/** アップロードするファイルの検査。画像か資料かを返す（受け付けないときは error） */
export function checkUpload(file: { name: string; size: number; type: string }, items: Asset[]): { kind: Asset['kind'] } | { error: string } {
  if (uploadCount(items) >= ASSET_LIMITS.uploads) return { error: `アップロードできるのは ${ASSET_LIMITS.uploads} 件までです。使っていない素材を削除してください` };
  if ((IMAGE_MIMES as readonly string[]).includes(file.type)) {
    if (file.size > ASSET_LIMITS.imageBytes) return { error: '画像は 10MB 以下にしてください' };
    return { kind: 'image' };
  }
  if (DOC_TYPES[file.type] || /\.(pdf|docx|xlsx|csv)$/i.test(file.name)) {
    if (file.size > ASSET_LIMITS.docBytes) return { error: '資料は 10MB 以下にしてください' };
    return { kind: 'doc' };
  }
  if (file.type === 'image/svg+xml') return { error: 'SVG はアップロードできません（PNG・JPEG・WebP・GIF にしてください）' };
  return { error: 'この種類のファイルはアップロードできません（画像: PNG・JPEG・WebP・GIF ／ 資料: PDF・Word・Excel・CSV）' };
}

export function validateAssetName(name: string, folder: string): string | null {
  if (!name.trim()) return '名前を入力してください';
  if (name.length > ASSET_LIMITS.name) return `名前は${ASSET_LIMITS.name}文字以内にしてください`;
  if (folder.length > ASSET_LIMITS.folder) return `フォルダ名は${ASSET_LIMITS.folder}文字以内にしてください`;
  return null;
}

/** 縮小後の画像が保存できる形か（JPEG の data URL・24KB 以下） */
export const validThumb = (src: string | undefined): boolean =>
  !!src && src.startsWith('data:image/jpeg;base64,') && src.length <= ASSET_LIMITS.thumbChars;

/** 保存データの大きさ（JSON の文字数）を足したら上限を超えるか */
export const overStorageBudget = (state: DemoState, extraChars: number): boolean =>
  JSON.stringify(state).length + extraChars > ASSET_LIMITS.stateChars;

export const assetTypeLabel = (a: Pick<Asset, 'kind' | 'mime' | 'preset' | 'name'>): string =>
  a.kind === 'image' ? (a.preset ? '見本の画像' : '画像') : DOC_TYPES[a.mime] ?? (a.name.split('.').pop()?.toUpperCase() || '資料');

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
