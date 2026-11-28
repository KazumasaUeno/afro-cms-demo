/**
 * サイトマップの編集・依頼の callable の配線（LIVE_SITEMAP_IMPL_PLAN §4 U-F1）。functions/src/index.ts は makeSitemapFunctions を呼んで
 * export するだけ（INT）。2 本とも全体既定（asia-northeast1・256MiB/30s・SA afro-cms-functions@）。**Secret を結ばない**（sec M-4）。
 * AI のフラグに依存しない（手で作る・編集・依頼は AI が off でも使える。AI 設計 §164）
 */
import { getFirestore } from 'firebase-admin/firestore';
import { onCall } from 'firebase-functions/https';
import { functionsLogger } from '../ai/log';
import { handleSaveSitemapEdits } from './edits';
import { handleSubmitSitemap } from './submit';

export function makeSitemapFunctions(opts: { enforceAppCheck: boolean; cors: boolean | string[] }) {
  const callableOpts = { enforceAppCheck: opts.enforceAppCheck, cors: opts.cors };
  const deps = () => ({ db: getFirestore(), now: Date.now, log: functionsLogger });
  const saveSitemapEdits = onCall(callableOpts, (req) => handleSaveSitemapEdits(req, deps()));
  const submitSitemap = onCall(callableOpts, (req) => handleSubmitSitemap(req, deps()));
  return { saveSitemapEdits, submitSitemap };
}
