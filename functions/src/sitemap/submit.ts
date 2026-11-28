/**
 * submitSitemap（onCall。LIVE_SITEMAP_DATA §2.3・§2.4・§3.2・§4、LIVE_SITEMAP_IMPL_PLAN §3・§4 U-F1、TM S-7）。
 * 入力 {projectId, baseEditSeq, expectRevision} → {revision, contentHash}
 * - 1 TX で: 版文書 sitemapVersions/r{N} を create（不変）＋承認記録 approvals/sitemap-r{N}-submit を create＋要約を requested
 * - N は TX 内で読んだ要約の revision + 1（サーバーが決める。expectRevision は一致の検査だけ＝sec L-2）。N ≦ 50
 * - 前提: 認可・archived・要件定義書 approved・AI 実行中でない（S-3・S-9）・スケジュールの approvedRevision あり（OQ-S2）・
 *   要約 draft・`baseEditSeq == internal.editSeq`・validateSitemapDoc 全件・改善後にトップ＋1 件以上
 * - 冪等: 同じ依頼の 2 回目（要約 requested・revision == expectRevision+1・editSeq 同じ・版のハッシュが internal と同じ）は
 *   同じ結果を返し WARN `sitemap.submit.duplicate` を出す（無音にしない）
 * - actor* は検証済みのトークン（uid・email）と accounts（name・role）から。入力から取らない
 */
import { Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/https';
import { resolveCaller, type AuthLike } from '../ai/authz';
import { errorCodeOf } from '../ai/log';
import { validateSitemapDoc } from '../ai/shared/sitemapRules';
import {
  approvalRef, assertWritable, conflict, failureFields, internalRef, invalid, precondition, projectIdOf, projectRef, seqOf,
  sitemapAiDraftRef, sitemapApprovalId, SITEMAP_MAX_REVISION, strictInput, versionRef, type SitemapDeps,
} from './common';
import { cleanDiagram, contentHashOf, toSitemapVersion } from './version';

export interface SubmitSitemapOutput { revision: number; contentHash: string }

export function parseSubmitSitemap(data: unknown): { projectId: string; baseEditSeq: number; expectRevision: number } {
  const d = strictInput(data, ['projectId', 'baseEditSeq', 'expectRevision'], ['projectId', 'baseEditSeq', 'expectRevision']);
  return { projectId: projectIdOf(d), baseEditSeq: seqOf(d, 'baseEditSeq'), expectRevision: seqOf(d, 'expectRevision') };
}

const pageCountOk = (after: unknown) => {
  const nodes = cleanDiagram(after).nodes;
  return nodes.length >= 2 && nodes.some((n) => n.data.kind === 'home');
};

export async function handleSubmitSitemap(req: { auth?: AuthLike | null; data: unknown }, deps: SitemapDeps): Promise<SubmitSitemapOutput> {
  const started = deps.now();
  if (!req.auth) throw new HttpsError('unauthenticated', 'sign-in required');
  const base = { event: 'sitemap.submit' };
  let input: ReturnType<typeof parseSubmitSitemap>;
  try {
    input = parseSubmitSitemap(req.data);
  } catch (e) {
    deps.log.info('sitemap.submit', { ...base, status: 'rejected', uid: req.auth.uid, errorCode: (e as HttpsError).code, ...failureFields(e) });
    throw e;
  }
  const { projectId, baseEditSeq, expectRevision } = input;
  const caller = await resolveCaller(deps.db, req.auth);
  const email = typeof req.auth.token?.email === 'string' ? req.auth.token.email : '';
  const db = deps.db;
  let duplicate = false;
  try {
    const out = await db.runTransaction(async (tx): Promise<SubmitSitemapOutput> => {
      duplicate = false;
      const [pSnap, iSnap, aiSnap, accSnap] = await Promise.all([
        tx.get(projectRef(db, projectId)), tx.get(internalRef(db, projectId)), tx.get(sitemapAiDraftRef(db, projectId)),
        tx.get(db.doc(`accounts/${caller.uid}`)),
      ]);
      const { p, name } = assertWritable(caller, pSnap, accSnap, aiSnap, deps.now());
      const approved = p.schedule?.approvedRevision;
      if (typeof approved !== 'number' || !Number.isInteger(approved) || approved < 1) throw precondition('schedule-not-approved');
      const b = p.sitemap;
      if (!b || typeof b.revision !== 'number' || !iSnap.exists) throw precondition('state');
      const internal = iSnap.data() ?? {};

      // 同じ依頼の 2 回目（応答が届かず押し直した等）
      if (b.status === 'requested' && b.revision === expectRevision + 1 && internal.editSeq === baseEditSeq) {
        const vSnap = await tx.get(versionRef(db, projectId, b.revision));
        const hash = contentHashOf(internal);
        if (vSnap.exists && vSnap.data()?.contentHash === hash && b.contentHash === hash) {
          duplicate = true;
          return { revision: b.revision, contentHash: hash };
        }
        throw precondition('state');
      }
      if (b.status !== 'draft') throw precondition('state');
      if (b.revision !== expectRevision || internal.editSeq !== baseEditSeq) throw conflict();
      const v = validateSitemapDoc({ before: internal.before, after: internal.after, devComment: internal.devComment ?? undefined });
      if (!v.ok) throw invalid(v.errors);
      if (!pageCountOk(internal.after)) throw invalid({ field: 'after.nodes', code: 'too_few_pages' });
      const revision = b.revision + 1;
      if (revision > SITEMAP_MAX_REVISION) throw precondition('revision-limit');

      const ts = Timestamp.fromMillis(deps.now());
      const contentHash = contentHashOf(internal);
      const version = toSitemapVersion(internal, { revision, contentHash, submittedAt: ts, submittedBy: caller.uid });
      tx.create(versionRef(db, projectId, revision), version);
      tx.create(approvalRef(db, projectId, sitemapApprovalId(revision, 'submit')), {
        schemaVersion: 1, kind: 'sitemap', action: 'submit', revision, side: 'afro',
        actorUid: caller.uid, actorName: name, actorEmail: email, at: ts, actorRole: caller.role,
        contentHash,
        pageCount: { before: cleanDiagram(internal.before).nodes.length, after: cleanDiagram(internal.after).nodes.length },
      });
      // 前回の承認の印（approvedRevision 等）は残す（お客様の「調整中（前回承認版）」。承認の Rules が差分で上書きする）
      tx.update(pSnap.ref, {
        'sitemap.status': 'requested', 'sitemap.revision': revision, 'sitemap.requestedAt': ts, 'sitemap.contentHash': contentHash,
        updatedAt: ts, updatedBy: caller.uid,
      });
      return { revision, contentHash };
    });
    if (duplicate) {
      deps.log.warn('sitemap.submit.duplicate', { ...base, status: 'duplicate', projectId, uid: caller.uid, revision: out.revision, durationMs: deps.now() - started });
    } else {
      deps.log.info('sitemap.submit', { ...base, status: 'submitted', projectId, uid: caller.uid, revision: out.revision, durationMs: deps.now() - started });
    }
    return out;
  } catch (raw) {
    // 版文書・承認記録の create が既存とぶつかった（要約と食い違う状態）。重複を作らず状態の不一致として返す
    const e = errorCodeOf(raw) === '6' || errorCodeOf(raw) === 'already-exists' ? precondition('state') : raw;
    const known = e instanceof HttpsError;
    deps.log[known ? 'info' : 'error']('sitemap.submit', {
      ...base, status: 'rejected', projectId, uid: caller.uid, errorCode: known ? e.code : errorCodeOf(e), ...failureFields(e), durationMs: deps.now() - started,
    });
    if (known) throw e;
    throw new HttpsError('internal', 'could not submit');
  }
}
