import type { AssetState } from '@/types';
import { ASSET_LIMITS } from './assets';

/**
 * 素材ドライブのカテゴリー（フォルダ）（2026-11-17 会議: お客様から写真・チラシの PDF・原稿・コメント付きの Word がまとめて届くので、
 * カテゴリーを作って分けたい。空のカテゴリーも残したい）。
 * 一覧は AssetState.folders（作ったカテゴリー）と素材の folder の和。folders が無い保存データ（0.40 まで）は素材の folder だけから求まるので、
 * 読み込み時の移行は要らない（版は上げない）。空文字 = カテゴリーなし（一覧には入れない）
 */

/** 作れるカテゴリーの数（案件ごと） */
export const ASSET_FOLDER_MAX = 30;

export function assetFolderList(assets: AssetState): string[] {
  const all = new Set<string>([...(assets.folders ?? []), ...assets.items.map((a) => a.folder)]);
  all.delete('');
  return Array.from(all).sort((a, b) => a.localeCompare(b, 'ja'));
}

/** 一覧を folders に書き出した素材ドライブ（素材を移してカテゴリーが 0 件になっても消えないように、書き換えるたびに持つ） */
export function withFolderList(assets: AssetState, extra?: string): AssetState {
  const list = assetFolderList(assets);
  const folders = extra && !list.includes(extra) ? [...list, extra].sort((a, b) => a.localeCompare(b, 'ja')) : list;
  return { ...assets, folders };
}

/** 新しいカテゴリーの名前の検査（問題なければ null）。画面と reducer の両方で使う */
export function validateNewFolder(name: string, assets: AssetState): string | null {
  const n = name.trim();
  if (!n) return 'カテゴリー名を入力してください';
  if (n.length > ASSET_LIMITS.folder) return `カテゴリー名は${ASSET_LIMITS.folder}文字以内にしてください`;
  const list = assetFolderList(assets);
  if (list.includes(n)) return '同じ名前のカテゴリーがあります';
  if (list.length >= ASSET_FOLDER_MAX) return `カテゴリーは ${ASSET_FOLDER_MAX} 件までです`;
  return null;
}

/** 素材の入っているカテゴリーは消さない（素材を先に別のカテゴリーへ移す）。消せるときは null */
export function folderDeleteBlock(name: string, assets: AssetState): string | null {
  const n = assets.items.filter((a) => a.folder === name).length;
  return n > 0 ? `素材が ${n} 件入っているため削除できません（先に別のカテゴリーへ移してください）` : null;
}
