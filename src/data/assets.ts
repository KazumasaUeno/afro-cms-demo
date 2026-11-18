import type { Asset, AssetState, CmsPage, DemoState, SitemapNode } from '@/types';
import { hasLiveVersion } from '@/features/cms/cmsUtils';
import { PROJECT_IMAGES, demoImageById, demoImageSrc } from './demoImages';

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
  /** 動画の元のファイルの大きさ（2026-11-18。中身は保存しないが、お客様から届く現実的な大きさに留める） */
  videoBytes: 500 * 1024 * 1024,
  /** 縮小後の画像（data URL の文字数） */
  thumbChars: 24 * 1024,
  /** 縮小後の長辺（px） */
  thumbEdge: 480,
  name: 60,
  folder: 20,
  /** ページ（サイトマップの path）の文字数（2026-11-18） */
  page: 200,
  /** 保存データ全体（JSON の文字数）。これを超えるアップロードは受け付けない（localStorage はおよそ 5MB） */
  stateChars: 3_000_000,
} as const;

export const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
export const DOC_TYPES: Record<string, string> = {
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel',
  'text/csv': 'CSV',
  // 2026-11-18 ユーザー指示「素材ドライブは、ページ別で画像、PDF、テキスト、動画で分ける」: 原稿のテキストも受け付ける
  'application/msword': 'Word',
  'text/plain': 'テキスト',
  'text/markdown': 'Markdown',
  'application/rtf': 'RTF',
  'text/rtf': 'RTF',
  'application/vnd.oasis.opendocument.text': 'ODT',
};
/** 資料として受け付ける拡張子（ブラウザが種類（mime）を付けないファイルもあるため。.md・.docx は Windows で空になることがある） */
const DOC_EXT = /\.(pdf|docx?|xlsx|csv|txt|md|rtf|odt)$/i;
/** 動画（2026-11-18。中身は保存しない） */
const VIDEO_EXT = /\.(mp4|mov|webm|m4v)$/i;
/** ファイル選択の accept */
export const ASSET_ACCEPT = [
  ...IMAGE_MIMES, ...Object.keys(DOC_TYPES), '.csv', '.pdf', '.doc', '.docx', '.xlsx', '.txt', '.md', '.rtf', '.odt',
  'video/*', '.mp4', '.mov', '.webm', '.m4v',
].join(',');

/** 拡張子から求めた種類（ブラウザが種類を付けなかったとき。分からなければ空文字） */
export function guessMime(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', csv: 'text/csv', txt: 'text/plain', md: 'text/markdown',
    rtf: 'application/rtf', odt: 'application/vnd.oasis.opendocument.text', mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
  };
  return fileName.includes('.') ? map[ext] ?? '' : '';
}

/**
 * 素材の分類（2026-11-18 ユーザー指示「素材ドライブは、ページ別で画像、PDF、テキスト、動画で分ける」）。保存はせず mime（無ければ名前の拡張子）から求める。
 * テキストは原稿・文書（Word・テキスト・Markdown・RTF・ODT のほか、0.43 までに入れた Excel・CSV もここへ入れる）
 */
export type AssetType = 'image' | 'pdf' | 'text' | 'video';
export const ASSET_TYPES: { key: AssetType; label: string }[] = [
  { key: 'image', label: '画像' }, { key: 'pdf', label: 'PDF' }, { key: 'text', label: 'テキスト' }, { key: 'video', label: '動画' },
];
export function assetType(a: Pick<Asset, 'kind' | 'mime' | 'name'>): AssetType {
  const mime = (a.mime || guessMime(a.name)).toLowerCase();
  if (a.kind === 'image' || mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('video/')) return 'video';
  return 'text';
}

/** 素材を分けるページ（2026-11-18）。キーはサイトマップ（after）の path */
export interface AssetPageOption { path: string; label: string; inSitemap: boolean }
/**
 * 素材ドライブのページの一覧。サイトマップ（after）の順（同じ path は 1 つ）。
 * サイトマップから消えたページの素材も見失わないよう、素材にだけあるページを後ろに足す（名前は path のまま）
 */
export function assetPageOptions(nodes: SitemapNode[], items: Asset[]): AssetPageOption[] {
  const seen = new Set<string>();
  const out: AssetPageOption[] = [];
  for (const n of nodes) {
    const path = n.data.path;
    if (!path || seen.has(path)) continue;
    seen.add(path);
    out.push({ path, label: n.data.label || path, inSitemap: true });
  }
  for (const a of items) {
    if (a.page && !seen.has(a.page)) {
      seen.add(a.page);
      out.push({ path: a.page, label: a.page, inSitemap: false });
    }
  }
  return out;
}

const PRESET_AT = '2026-11-01T00:00:00.000Z';
const PRESET_PREFIX = 'asset-preset-';

const presetCache = new Map<string, Asset[]>();
/**
 * 見本の写真（案件ごとに最初から入っている。画像データは保存せず、同梱の写真を指す）。
 * 2026-11-17 から案件の業種に合う写真（以前はどの案件にも MINAMO COFFEE の SVG 4 点）。見本の写真が無い案件（作ったばかりの案件）は空
 */
export const presetAssets = (projectId: string): Asset[] => {
  const hit = presetCache.get(projectId);
  if (hit) return hit;
  const items = (PROJECT_IMAGES[projectId] ?? []).map((i) => ({
    id: `${PRESET_PREFIX}${i.id}`, name: i.label, kind: 'image' as const, folder: i.folder, mime: 'image/jpeg', size: i.bytes,
    preset: i.id, createdAt: PRESET_AT, createdBy: 'アフロ',
  }));
  presetCache.set(projectId, items);
  return items;
};

/** 選んでいる案件の素材（無ければその案件の見本の写真。最初に変えたときに保存する） */
export const assetsOf = (state: Pick<DemoState, 'assets' | 'requirements'>): AssetState =>
  state.assets ?? { items: presetAssets(state.requirements.projectId) };

/**
 * 0.39 までの保存データの素材ドライブ（見本が SVG の珈琲 4 点）を、その案件の見本の写真に置き換える（2026-11-17。版は上げない）。
 * アップロードした素材はそのまま残し、見本だけを入れ替える。古い見本が無ければ同じものを返す
 */
export function withProjectPresets(projectId: string, assets: AssetState | undefined): AssetState | undefined {
  if (!assets || !assets.items.some((a) => a.preset && a.mime === 'image/svg+xml')) return assets;
  return { ...assets, items: [...presetAssets(projectId), ...assets.items.filter((a) => !a.preset)] };
}

/** 表示する画像の src（見本は同梱の写真。資料は無し）。0.39 までの保存データの見本（beans など）も同じ id で引ける */
export const assetSrc = (a: Pick<Asset, 'preset' | 'src'>): string | undefined => {
  if (!a.preset) return a.src;
  const img = demoImageById(a.preset);
  return img ? demoImageSrc(img) : undefined;
};

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
export function checkUpload(file: { name: string; size: number; type: string }, items: Asset[]): { kind: Asset['kind']; video?: boolean } | { error: string } {
  if (uploadCount(items) >= ASSET_LIMITS.uploads) return { error: `アップロードできるのは ${ASSET_LIMITS.uploads} 件までです。使っていない素材を削除してください` };
  if ((IMAGE_MIMES as readonly string[]).includes(file.type)) {
    if (file.size > ASSET_LIMITS.imageBytes) return { error: '画像は 10MB 以下にしてください' };
    return { kind: 'image' };
  }
  // 動画は kind 'doc'（名前・種類・大きさだけ。2026-11-18）
  if (file.type.startsWith('video/') || VIDEO_EXT.test(file.name)) {
    if (file.size > ASSET_LIMITS.videoBytes) return { error: '動画は 500MB 以下にしてください' };
    return { kind: 'doc', video: true };
  }
  if (DOC_TYPES[file.type] || DOC_EXT.test(file.name)) {
    if (file.size > ASSET_LIMITS.docBytes) return { error: '資料は 10MB 以下にしてください' };
    return { kind: 'doc' };
  }
  if (file.type === 'image/svg+xml') return { error: 'SVG はアップロードできません（PNG・JPEG・WebP・GIF にしてください）' };
  return { error: 'この種類のファイルはアップロードできません（画像: PNG・JPEG・WebP・GIF ／ PDF ／ テキスト: Word・テキスト・Markdown・RTF・ODT・Excel・CSV ／ 動画: MP4・MOV・WebM）' };
}

export function validateAssetName(name: string, folder: string, page = ''): string | null {
  if (!name.trim()) return '名前を入力してください';
  if (name.length > ASSET_LIMITS.name) return `名前は${ASSET_LIMITS.name}文字以内にしてください`;
  if (folder.length > ASSET_LIMITS.folder) return `フォルダ名は${ASSET_LIMITS.folder}文字以内にしてください`;
  if (page.length > ASSET_LIMITS.page) return 'ページの指定が長すぎます';
  return null;
}

/** 縮小後の画像が保存できる形か（JPEG の data URL・24KB 以下） */
export const validThumb = (src: string | undefined): boolean =>
  !!src && src.startsWith('data:image/jpeg;base64,') && src.length <= ASSET_LIMITS.thumbChars;

/** 保存データの大きさ（JSON の文字数）を足したら上限を超えるか */
export const overStorageBudget = (state: DemoState, extraChars: number): boolean =>
  JSON.stringify(state).length + extraChars > ASSET_LIMITS.stateChars;

export const assetTypeLabel = (a: Pick<Asset, 'kind' | 'mime' | 'preset' | 'name'>): string =>
  // 見本の写真も「画像」と出す（実際の案件の素材に見えるように。2026-11-17 ユーザー指示「リアルっぽく」）
  a.kind === 'image' ? '画像' : a.mime.startsWith('video/') ? '動画' : DOC_TYPES[a.mime] ?? (a.name.split('.').pop()?.toUpperCase() || '資料');

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
