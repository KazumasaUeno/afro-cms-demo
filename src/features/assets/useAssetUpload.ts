import { useEffect, useRef, useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { useToast } from '@/hooks/useToast';
import { ASSET_LIMITS, assetsOf, checkUpload, guessMime, overStorageBudget } from '@/data/assets';
import { makeThumbnail } from './thumbnail';

/**
 * 素材ドライブへのアップロード（2026-11-17 会議で AssetDrivePage から切り出し）。
 * 素材ドライブの画面と、ページ編集の画像選択（ImagePickerDialog。お客様ポータルからも使う）が同じ検査・同じ保存先を通る。
 * - actor: 開発者画面は { devBy }、お客様ポータルは { by: 'client' }（reducer はお客様からは画像だけ受け付ける）
 * - imagesOnly: 画像以外を選んだらエラーにする（画像選択から使うとき）
 * 戻り値の upload は、保存した画像の src と名前を返す（資料・失敗のときは null）。画像選択はこれでそのまま選ぶ
 * - page: どのページの素材か（2026-11-18 ユーザー指示「素材ドライブは、ページ別で画像、PDF、テキスト、動画で分ける」。省略・空 = ページ未設定）
 * - 動画は名前・種類・大きさだけ登録する（デモの保存領域が小さいため中身は保存しない。2026-11-18）
 */
export function useAssetUpload(actor: { devBy: string } | { by: 'client' }, opts: { imagesOnly?: boolean } = {}) {
  const { state, dispatch } = useDemo();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  // 縮小の途中で画面を離れたら（案件の切り替えで作り直されたときも）保存しない（0.39.1。2026-11-16）
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const upload = async (file: File, folder: string, page = ''): Promise<{ src: string; label: string } | null> => {
    const items = assetsOf(state).items;
    const check = checkUpload(file, items);
    if ('error' in check) { toast(check.error, 'error'); return null; }
    if (opts.imagesOnly && check.kind !== 'image') { toast('ここでは画像（PNG・JPEG・WebP・GIF）だけアップロードできます', 'error'); return null; }
    const name = file.name.replace(/\.[^.]+$/, '').slice(0, ASSET_LIMITS.name) || '無題';
    // 保存先の案件は縮小を始める前に決める（縮小の途中で案件を切り替えても、別の案件へ保存しない。0.39.1。2026-11-16）
    const projectId = state.requirements.projectId;
    let src: string | undefined;
    if (check.kind === 'image') {
      setBusy(true);
      src = (await makeThumbnail(file)) ?? undefined;
      if (alive.current) setBusy(false);
      if (!alive.current) { toast('縮小の途中で画面を離れた（または案件が切り替わった）ため、アップロードを取り消しました。もう一度アップロードしてください', 'error'); return null; }
      if (!src) { toast('この画像は読み込めませんでした（壊れているか、対応していない形式です）', 'error'); return null; }
    }
    // 保存データの上限（localStorage）を超えるなら保存しない。黙って保存に失敗しないよう、ここで理由を出す
    if (overStorageBudget(state, (src?.length ?? 0) + 300)) {
      toast('保存できる容量の上限に達しました。使っていない素材を削除してからアップロードしてください', 'error');
      return null;
    }
    // 種類が空のファイル（.md など）は拡張子から補う（PDF・テキスト・動画に分けるため。2026-11-18）
    const mime = file.type || guessMime(file.name);
    dispatch({ type: 'addAsset', asset: { name, kind: check.kind, folder: folder.trim(), ...(page.trim() ? { page: page.trim() } : {}), mime, size: file.size, ...(src ? { src } : {}) }, projectId, ...actor });
    toast(check.kind === 'image'
      ? `「${name}」をアップロードしました（縮小して保存${folder ? `・${folder}` : ''}）`
      : check.video ? `「${name}」を登録しました（デモでは動画の中身は保存しません）` : `「${name}」を登録しました（デモのため中身は保存しません）`);
    return src ? { src, label: name } : null;
  };

  return { upload, busy };
}
