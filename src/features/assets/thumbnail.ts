import { ASSET_LIMITS } from '@/data/assets';

/**
 * アップロードした画像をブラウザの中で縮小し、JPEG の data URL（24KB 以下）にする（0.36.0）。
 * 元の画像は保存しない（localStorage の容量を守るため）。長辺 480→360→280px・品質 0.7→0.4 で試し、収まらなければ null
 */
export async function makeThumbnail(file: File): Promise<string | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('decode'));
      el.src = url;
    });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    // 長辺 480px から、収まらなければ 360px・280px へ縮める
    for (const edge of [ASSET_LIMITS.thumbEdge, 360, 280]) {
      const scale = Math.min(1, edge / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      canvas.width = w;
      canvas.height = h;
      // 透過 PNG は JPEG にすると黒くなるので、白で塗ってから描く
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      for (const q of [0.7, 0.6, 0.5, 0.4]) {
        const data = canvas.toDataURL('image/jpeg', q);
        if (data.length <= ASSET_LIMITS.thumbChars) return data;
      }
    }
    return null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
