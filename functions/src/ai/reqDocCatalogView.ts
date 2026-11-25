/**
 * 項目カタログ（shared/reqDocCatalog.ts。正は src/shared/ai/reqDocCatalog.ts）を Functions で使うための読み出し（REQUIREMENTS_DOC_TEMPLATE.md §1.2・§4.1）。
 * カタログの値はここで足さない・変えない（見る角度だけ）
 */
import { REQ_DOC_TEMPLATE, reqDocCatalogOf, type ReqDocCatalog, type ReqDocCatalogItem } from './shared/reqDocCatalog';

/** 生成に使うひな型の版（新しく作る v3 はいつもこの版） */
export const CURRENT_TEMPLATE_VERSION = REQ_DOC_TEMPLATE.version;

export function catalogOrThrow(version: string = CURRENT_TEMPLATE_VERSION): ReqDocCatalog {
  const c = reqDocCatalogOf(version);
  if (!c) throw new Error('unknown template version');
  return c;
}

/** AI が下書きする項目（fill:'ai'。版 0.1 は 41 件） */
export function reqDocAiItems(version: string = CURRENT_TEMPLATE_VERSION): ReqDocCatalogItem[] {
  return catalogOrThrow(version).items.filter((i) => i.fill === 'ai');
}

/** '01 プロジェクト概要・体制' */
export function reqDocChapterTitle(chapterId: string, version: string = CURRENT_TEMPLATE_VERSION): string {
  const ch = catalogOrThrow(version).chapters.find((c) => c.id === chapterId);
  return ch ? `${ch.no} ${ch.title}` : chapterId;
}

/**
 * AI追加を置いてよい章。[DECISION ai-engineer U2 2026-11-25] 全項目が固定の章（11・14・15。アフロの標準仕様＝AI は書かない＝Q-1）と、
 * サーバーが集める 22 章（未決事項・課題管理）は除く
 */
export function reqDocAiChapterIds(version: string = CURRENT_TEMPLATE_VERSION): string[] {
  const c = catalogOrThrow(version);
  return c.chapters
    .filter((ch) => ch.id !== 'c22' && c.items.some((i) => i.chapterId === ch.id && i.kubun !== 'fixed'))
    .map((ch) => ch.id);
}

/** 同じ名前の判定用（空白を除き、全角英数を半角・小文字に） */
export const labelKey = (s: string): string => s.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
