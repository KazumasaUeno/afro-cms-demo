/**
 * saveAiDraftEdits（onCall。計画 §4 U1 の代替 F-a）: 開発者の edited を検査して Admin SDK で書く（aiDrafts はクライアントから書けない）。
 * - admin とアサインされた開発者（お客様・担当外は不可。authz.assertCanEdit。2026-11-26 に admin を追加）。フラグの内側（editAllowed）
 * - transaction で 要件が draft・aiDraft と generated があること・生成中（job running）でないこと を確かめる（submit と同時に保存させない）
 * - 書くのは edited / editedAt / editedBy / updatedAt / updatedBy と、v3 だけ submitReady（サーバー欄に触れない）
 * - submitReady（v3）: { requiredOk, templateVersion }。必須の章（REQ_DOC_REQUIRED_CHAPTERS）が埋まっているかを edited と同じ書き込みで記録し、
 *   Rules の proposalV3Ok が submit の条件にする（提案には写さない）。v2 の保存では消す
 */
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/https';
import { assertCanEdit, resolveCaller, type AuthLike, type ProjectLike } from './authz';
import { EditableError, validateEditable } from './editable';
import { isEditedV3Shape, validateEditableV3, type GeneratedV3Like } from './reqDocEditable';
import { editAllowed, type AiFlags } from './flags';
import { errorCodeOf, type AiLogger } from './log';
import { draftRef, jobRunning } from './request';
import { reqDocRequiredOk } from './shared/reqDocCatalog';
import type { AiEditableV3 } from './shared/aiDraft';

export interface EditsDeps {
  db: Firestore;
  now: () => number;
  flags: () => AiFlags;
  log: AiLogger;
}

const PROJECT_ID = /^[A-Za-z0-9_-]{1,128}$/;

export async function handleSaveEdits(req: { auth?: AuthLike | null; data: unknown }, deps: EditsDeps): Promise<{ ok: true }> {
  const flags = deps.flags();
  if (flags.mode === 'off') throw new HttpsError('failed-precondition', 'feature-disabled');
  const d = (req.data && typeof req.data === 'object' ? req.data : {}) as Record<string, unknown>;
  const projectId = d.projectId;
  if (typeof projectId !== 'string' || !PROJECT_ID.test(projectId)) throw new HttpsError('invalid-argument', 'projectId is invalid');
  const caller = await resolveCaller(deps.db, req.auth);
  if (!editAllowed(flags, projectId)) throw new HttpsError('failed-precondition', 'feature-disabled');
  // v2 は generated を読む前に検査する（今と同じ）。v3（doc を持つ）は generated の版のカタログ・by・evidence と照らすので transaction の中で
  const v3 = isEditedV3Shape(d.edited);
  const invalid = (e: unknown) => (e instanceof EditableError ? new HttpsError('invalid-argument', `edited is invalid: ${e.field}`) : e);
  let edited: unknown;
  if (!v3) {
    try {
      edited = validateEditable(d.edited);
    } catch (e) {
      throw invalid(e);
    }
  }
  const db = deps.db;
  try {
    await db.runTransaction(async (tx) => {
      const [pSnap, aSnap] = await Promise.all([tx.get(db.doc(`projects/${projectId}`)), tx.get(draftRef(db, projectId))]);
      assertCanEdit(caller, pSnap.data() as ProjectLike | undefined);
      if ((pSnap.data() as ProjectLike).requirements?.status !== 'draft') throw new HttpsError('failed-precondition', 'not-draft');
      if (!aSnap.exists || !aSnap.data()?.generated) throw new HttpsError('failed-precondition', 'no-generated');
      // 生成中は保存させない（Lead DECISION 2026-11-24。discardEdits の生成が終わると edited が消え、保存が黙って失われるため）
      if (jobRunning(aSnap.data()?.job, deps.now())) throw new HttpsError('failed-precondition', 'generation-running');
      // 版の取り違え（v2 の下書きに v3 の編集・その逆）は拒否
      const generated = aSnap.data()?.generated as { version?: unknown } | undefined;
      if ((generated?.version === 3) !== v3) throw new HttpsError('invalid-argument', 'edited is invalid: version');
      if (v3) {
        try {
          edited = validateEditableV3(d.edited, generated as GeneratedV3Like);
        } catch (e) {
          throw invalid(e);
        }
      }
      const ts = Timestamp.fromMillis(deps.now());
      const templateVersion = v3 ? String((generated as GeneratedV3Like).template.version) : '';
      const submitReady = v3
        ? { requiredOk: reqDocRequiredOk((edited as AiEditableV3).doc, templateVersion), templateVersion }
        : FieldValue.delete();
      tx.update(aSnap.ref, { edited, editedAt: ts, editedBy: caller.uid, updatedAt: ts, updatedBy: caller.uid, submitReady });
    });
  } catch (e) {
    const code = e instanceof HttpsError ? e.code : errorCodeOf(e);
    deps.log[e instanceof HttpsError ? 'info' : 'error']('ai.edits', { event: 'ai.edits', status: 'rejected', projectId, uid: caller.uid, errorCode: code });
    if (e instanceof HttpsError) throw e;
    throw new HttpsError('internal', 'could not save');
  }
  deps.log.info('ai.edits', { event: 'ai.edits', status: 'saved', projectId, uid: caller.uid });
  return { ok: true };
}
