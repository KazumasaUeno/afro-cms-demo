/**
 * saveSitemapEdits（onCall。LIVE_SITEMAP_DATA §3.2・D-5、LIVE_SITEMAP_IMPL_PLAN §3・§4 U-F1）。
 * 入力 {projectId, op:'createManual'|'save', baseEditSeq, before, after, devComment?:{text}} → {editSeq}
 * - createManual: 要約が無い（none）ときだけ。改善後はトップ 1 件だけ・現在は空（PLAN §3 none → draft（手で））。origin は 'manual'（サーバーが決める）
 * - save: 要約 draft・`baseEditSeq == internal.editSeq` のときだけ丸ごと置換し editSeq+1（違えば aborted＝競合。AC-16）
 * - 共通: 認可・archived・要件定義書 approved・AI 実行中でない を TX 内のスナップショットで（S-3・S-9・sec M-1）
 * - 受けない: origin・editSeq・status・updatedBy・revision ほか未知キー（invalid-argument。sec L-1）
 * - ログと details は種別だけ（ラベル・パス・理由・コメントを出さない。sec M-6）
 */
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/https';
import { resolveCaller, type AuthLike } from '../ai/authz';
import { errorCodeOf } from '../ai/log';
import { validateSitemapDoc } from '../ai/shared/sitemapRules';
import {
  assertWritable, conflict, failureFields, internalRef, invalid, isObj, precondition, projectIdOf, projectRef, seqOf,
  sitemapAiDraftRef, strictInput, type SitemapDeps,
} from './common';
import { cleanDiagram, type Diagram, type StoredDevComment } from './version';

export interface SaveSitemapEditsOutput { editSeq: number }

/** 手で作るときの初期の図（改善後にトップ 1 件だけ。現在は空） */
export function manualSitemapStart(): { before: Diagram; after: Diagram } {
  return {
    before: { nodes: [], edges: [] },
    after: { nodes: [{ id: 'a-home', position: { x: 0, y: 0 }, data: { label: 'トップ', path: '/', kind: 'home' } }], edges: [] },
  };
}

type Parsed =
  | { op: 'createManual'; projectId: string }
  | { op: 'save'; projectId: string; baseEditSeq: number; before: Diagram; after: Diagram; commentText: string | null };

/** 入力の検査（DB を読まない）。不正は invalid-argument */
export function parseSaveSitemapEdits(data: unknown): Parsed {
  const head = isObj(data) ? data.op : undefined;
  if (head === 'createManual') {
    const d = strictInput(data, ['projectId', 'op'], ['projectId', 'op']);
    return { op: 'createManual', projectId: projectIdOf(d) };
  }
  if (head !== 'save') {
    strictInput(data, ['projectId', 'op', 'baseEditSeq', 'before', 'after', 'devComment'], ['projectId', 'op']);
    throw invalid({ field: 'op', code: 'shape' });
  }
  const d = strictInput(data, ['projectId', 'op', 'baseEditSeq', 'before', 'after', 'devComment'], ['projectId', 'op', 'baseEditSeq', 'before', 'after']);
  const projectId = projectIdOf(d);
  const baseEditSeq = seqOf(d, 'baseEditSeq');
  const c = d.devComment;
  if (c !== undefined && (!isObj(c) || !Object.keys(c).every((k) => k === 'text') || typeof c.text !== 'string')) {
    throw invalid({ field: 'devComment', code: 'shape' });
  }
  const v = validateSitemapDoc({ before: d.before, after: d.after, devComment: c });
  if (!v.ok) throw invalid(v.errors);
  const text = isObj(c) ? (c.text as string).trim() : '';
  return { op: 'save', projectId, baseEditSeq, before: cleanDiagram(d.before), after: cleanDiagram(d.after), commentText: text.length > 0 ? text : null };
}

export async function handleSaveSitemapEdits(req: { auth?: AuthLike | null; data: unknown }, deps: SitemapDeps): Promise<SaveSitemapEditsOutput> {
  const started = deps.now();
  if (!req.auth) throw new HttpsError('unauthenticated', 'sign-in required');
  const op = isObj(req.data) && (req.data.op === 'createManual' || req.data.op === 'save') ? req.data.op : 'unknown';
  const base = { event: 'sitemap.edits', op };
  let parsed: Parsed;
  try {
    parsed = parseSaveSitemapEdits(req.data);
  } catch (e) {
    deps.log.info('sitemap.edits', { ...base, status: 'rejected', uid: req.auth.uid, errorCode: (e as HttpsError).code, ...failureFields(e) });
    throw e;
  }
  const { projectId } = parsed;
  const caller = await resolveCaller(deps.db, req.auth);
  const db = deps.db;
  try {
    const editSeq = await db.runTransaction(async (tx) => {
      const [pSnap, iSnap, aiSnap, accSnap] = await Promise.all([
        tx.get(projectRef(db, projectId)), tx.get(internalRef(db, projectId)), tx.get(sitemapAiDraftRef(db, projectId)),
        tx.get(db.doc(`accounts/${caller.uid}`)),
      ]);
      const { p, name } = assertWritable(caller, pSnap, accSnap, aiSnap, deps.now());
      const ts = Timestamp.fromMillis(deps.now());
      const summary = p.sitemap;
      if (parsed.op === 'createManual') {
        if ((summary !== undefined && summary !== null) || iSnap.exists) throw precondition('state');
        const rev = p.requirements?.revision;
        tx.create(iSnap.ref, {
          schemaVersion: 1,
          ...manualSitemapStart(),
          origin: 'manual',
          ...(typeof rev === 'number' ? { sourceReqRevision: rev } : {}),
          editSeq: 0,
          updatedAt: ts, updatedBy: caller.uid, savedByName: name,
        });
        tx.update(pSnap.ref, { sitemap: { status: 'draft', revision: 0 }, updatedAt: ts, updatedBy: caller.uid });
        return 0;
      }
      if (!summary || summary.status !== 'draft' || !iSnap.exists) throw precondition('state');
      const cur = iSnap.data() ?? {};
      if (cur.editSeq !== parsed.baseEditSeq) throw conflict();
      const prev = cur.devComment as StoredDevComment | undefined;
      // コメントの本文が同じなら、書いた人と日時は変えない（保存のたびに「開発担当者より」の日時が動かない）
      const devComment = parsed.commentText === null
        ? FieldValue.delete()
        : prev && prev.text === parsed.commentText
          ? prev
          : { text: parsed.commentText, at: ts, byUid: caller.uid, byName: name };
      const next = parsed.baseEditSeq + 1;
      tx.update(iSnap.ref, {
        before: parsed.before, after: parsed.after, devComment,
        editSeq: next, updatedAt: ts, updatedBy: caller.uid, savedByName: name,
      });
      return next;
    });
    deps.log.info('sitemap.edits', { ...base, status: 'saved', projectId, uid: caller.uid, editSeq, durationMs: deps.now() - started });
    return { editSeq };
  } catch (e) {
    const known = e instanceof HttpsError;
    deps.log[known ? 'info' : 'error']('sitemap.edits', {
      ...base, status: 'rejected', projectId, uid: caller.uid, errorCode: known ? e.code : errorCodeOf(e), ...failureFields(e), durationMs: deps.now() - started,
    });
    if (known) throw e;
    throw new HttpsError('internal', 'could not save');
  }
}
