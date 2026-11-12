#!/usr/bin/env node
// npm run seed:emulator — 起動中のエミュレータ（npm run emulators）に、最初の管理者の招待を入れる。
// 本番では Console で手で作る文書（BACKEND_FIREBASE §2.5）と同じ形。エミュレータ専用（demo- 以外・127.0.0.1 以外なら throw）。
// firebase-admin・gcloud・ADC は使わない（エミュレータの REST に `Authorization: Bearer owner` で書く＝Rules を通らない Console 相当）。
//   node scripts/seed-emulator.mjs [admin のメール] [名前]
//   node scripts/seed-emulator.mjs --verify   … エミュレータが出したメール確認リンクをすべて開く（確認メールの代わり）
import { EMULATOR_PROJECT_ID } from './firebase-projects.mjs';

const PROJECT = EMULATOR_PROJECT_ID;
const FIRESTORE = 'http://127.0.0.1:8080';
const AUTH = 'http://127.0.0.1:9099';
if (!PROJECT.startsWith('demo-')) throw new Error(`demo- 以外のプロジェクト（${PROJECT}）には書かない`);
for (const u of [FIRESTORE, AUTH]) if (new URL(u).hostname !== '127.0.0.1') throw new Error(`エミュレータ以外（${u}）には書かない`);

async function call(url, init) {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner', ...(init?.headers ?? {}) } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${url} → ${res.status} ${text}`);
  return text ? JSON.parse(text) : {};
}

async function verifyAll() {
  const { oobCodes = [] } = await call(`${AUTH}/emulator/v1/projects/${PROJECT}/oobCodes`);
  const pending = oobCodes.filter((c) => c.requestType === 'VERIFY_EMAIL');
  for (const c of pending) {
    // oobLink はエミュレータの URL（127.0.0.1:9099）。開くと確認済みになる
    const link = new URL(c.oobLink);
    if (link.hostname !== '127.0.0.1') throw new Error(`エミュレータ以外のリンク: ${link.origin}`);
    const res = await fetch(link);
    console.log(`verified ${c.email}: ${res.status}`);
  }
  console.log(`メール確認: ${pending.length} 件`);
}

async function seedAdmin(email, name) {
  const id = email.trim().toLowerCase();
  const doc = `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/invites?documentId=${encodeURIComponent(id)}`;
  await call(doc, {
    method: 'POST',
    body: JSON.stringify({
      fields: {
        schemaVersion: { integerValue: '1' },
        role: { stringValue: 'admin' },
        status: { stringValue: 'invited' },
        name: { stringValue: name },
        createdAt: { timestampValue: new Date().toISOString() },
        createdBy: { stringValue: 'console' },
      },
    }),
  });
  console.log(`invites/${id}（admin・${name}）を作りました。アプリの /login で「招待されたメールで登録」してください`);
}

const args = process.argv.slice(2);
try {
  if (args[0] === '--verify') await verifyAll();
  else await seedAdmin(args[0] ?? 'admin@example.com', args[1] ?? '管理者 太郎');
} catch (e) {
  console.error(`seed:emulator を中止しました: ${e.message}（npm run emulators を起動しているか確認）`);
  process.exit(1);
}
