/**
 * saveAiDraftEdits（onCall。計画 §4 U1 の代替 F-a）: 開発者の edited を検査して Admin SDK で書く（aiDrafts はクライアントから書けない）。
 * - アサインされた開発者だけ（admin・お客様は不可）。フラグの内側（editAllowed）
 * - transaction で 要件が draft・aiDraft と generated があること・生成中（job running）でないこと を確かめる（submit と同時に保存させない）
 * - 書くのは edited / editedAt / editedBy / updatedAt / updatedBy だけ（サーバー欄に触れない）
 */
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/https';
import { assertCanEdit, resolveCaller, type AuthLike, type ProjectLike } from './authz';
import { EditableError, validateEditable } from './editable';
import { editAllowed, type AiFlags } from './flags';
import { errorCodeOf, type AiLogger } from './log';
import { draftRef, jobRunning } from './request';

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
  let edited;
  try {
    edited = validateEditable(d.edited);
  } catch (e) {
    if (e instanceof EditableError) throw new HttpsError('invalid-argument', `edited is invalid: ${e.field}`);
    throw e;
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
      const ts = Timestamp.fromMillis(deps.now());
      tx.update(aSnap.ref, { edited, editedAt: ts, editedBy: caller.uid, updatedAt: ts, updatedBy: caller.uid });
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
