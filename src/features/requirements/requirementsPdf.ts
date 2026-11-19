import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas-pro';

/**
 * 要件定義書の HTML（buildRequirementsDocHtml）を A4 の PDF にしてダウンロードさせる（2026-11-19 ユーザー指示「印刷ではなくダウンロード」）。
 * - ブラウザの中だけで作る（外部へ送らない）。重い部品なので requirementsDoc.ts から動的 import で読む（普段の画面には入れない）
 * - 見えない iframe に HTML を入れて画像にし、ページの高さで切る。切る位置は行・見出し・段落の上端から選び、表の行や見出しの直後で切らない
 * - 画像の PDF なので文字は選択できない（日本語フォントを埋め込むと数 MB 増えるため。2026-11-19 lead-architect 判断）
 */

const A4_W_MM = 210;
const A4_H_MM = 297;
const MARGIN_Y_MM = 14;
/** 画面上の幅（px）。A4 の幅に当てる。左右の余白は HTML の padding で付ける */
const PAGE_W_PX = 794;
const PX_PER_MM = PAGE_W_PX / A4_W_MM;
const CONTENT_H_PX = Math.floor((A4_H_MM - MARGIN_Y_MM * 2) * PX_PER_MM);

/** PDF 用の上書き: 余白は PDF 側で付けるので body の margin を外し、デモの注記（印刷では消える）も消す */
const PDF_CSS = 'body{margin:0!important;max-width:none!important;padding:0 52px!important;background:#fff}.note{display:none!important}';

/** ページを切ってよい位置（要素の上端。見出しの直後・表の 1 行目は除く） */
function breakPoints(doc: Document): number[] {
  const top0 = doc.body.getBoundingClientRect().top;
  const points = new Set<number>();
  doc.body.querySelectorAll('h1,h2,h3,p,dl,li,tr').forEach((el) => {
    const prev = el.previousElementSibling;
    if (prev && /^H[1-3]$/.test(prev.tagName)) return; // 見出しだけがページの下に残らないように
    if (el.tagName === 'TR' && !prev) return; // 表の 1 行目は表の前（見出し）で切る
    points.add(Math.round(el.getBoundingClientRect().top - top0));
  });
  return [...points].sort((a, b) => a - b);
}

/** 0〜total を、1 ページに入る高さ以下で、できるだけ切ってよい位置で区切る */
function pageRanges(total: number, points: number[]): [number, number][] {
  const ranges: [number, number][] = [];
  let y = 0;
  while (y < total) {
    const limit = y + CONTENT_H_PX;
    if (limit >= total) { ranges.push([y, total]); break; }
    // ページの 3 割より上でしか切れないときは、無理に区切らず高さで切る（長い 1 行の回答など）
    const cut = [...points].reverse().find((p) => p <= limit && p > y + CONTENT_H_PX * 0.3) ?? limit;
    ranges.push([y, cut]);
    y = cut;
  }
  return ranges;
}

const safeFileName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '_');

export async function downloadRequirementsPdf(html: string): Promise<void> {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.tabIndex = -1;
  // 中のスクリプトは動かさない（HTML は esc 済みだが多重の守り）。同一オリジンは中の文書を読むために残す
  iframe.setAttribute('sandbox', 'allow-same-origin');
  iframe.style.cssText = `position:fixed;left:-10000px;top:0;width:${PAGE_W_PX}px;height:${A4_H_MM * PX_PER_MM}px;border:0`;
  try {
    await new Promise<void>((resolve, reject) => {
      // 読み込みが終わらないときにボタンが効かないままにならないよう 10 秒で諦める
      const timer = window.setTimeout(() => reject(new Error('requirements pdf: iframe load timeout')), 10_000);
      iframe.onload = () => { window.clearTimeout(timer); resolve(); };
      iframe.srcdoc = html;
      document.body.appendChild(iframe);
    });
    const doc = iframe.contentDocument;
    if (!doc) throw new Error('requirements pdf: iframe document unavailable');
    const style = doc.createElement('style');
    style.textContent = PDF_CSS;
    doc.head.appendChild(style);
    await doc.fonts?.ready;
    const total = Math.ceil(doc.body.scrollHeight);
    iframe.style.height = `${total}px`;

    // キャンバスの大きさの上限（iOS Safari は約 1,670 万画素、Chrome・Firefox は高さ約 32,767px）を超えないよう倍率を下げる
    const scale = Math.min(2, Math.sqrt(16_000_000 / (PAGE_W_PX * total)), 32_000 / total);
    // 切る位置は html2canvas が描く複製の文書で測る（複製は組み直されるため、元の文書の位置とは下へ行くほどずれる）
    let points: number[] = [];
    const canvas = await html2canvas(doc.body, {
      scale, backgroundColor: '#ffffff', width: PAGE_W_PX, windowWidth: PAGE_W_PX, logging: false,
      onclone: (cloned) => { points = breakPoints(cloned); },
    });
    const drawnH = canvas.height / scale;

    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    const ranges = pageRanges(drawnH, points);
    const slice = document.createElement('canvas');
    const ctx = slice.getContext('2d');
    if (!ctx) throw new Error('requirements pdf: canvas 2d unavailable');
    ranges.forEach(([y0, y1], i) => {
      const sy = Math.round(y0 * scale);
      const sh = Math.max(1, Math.round((y1 - y0) * scale));
      slice.width = canvas.width;
      slice.height = sh;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, slice.width, sh);
      ctx.drawImage(canvas, 0, sy, canvas.width, sh, 0, 0, canvas.width, sh);
      if (i > 0) pdf.addPage();
      pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', 0, MARGIN_Y_MM, A4_W_MM, (y1 - y0) / PX_PER_MM);
      pdf.setFontSize(9);
      pdf.setTextColor(100, 116, 139);
      pdf.text(`${i + 1} / ${ranges.length}`, A4_W_MM / 2, A4_H_MM - 7, { align: 'center' });
    });
    pdf.save(`${safeFileName(doc.title || '要件定義書')}.pdf`);
  } finally {
    iframe.remove();
  }
}
