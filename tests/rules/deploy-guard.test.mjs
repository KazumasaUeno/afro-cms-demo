// デプロイスクリプトの拒否条件（何も実行しない。checkDeploy は判定だけ）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkAiLegalClearance, checkDeploy, parseDeployArgs } from '../../scripts/deploy-firebase.mjs';
import { checkAiSitemapLegalClearance, hasAiScopeLine } from '../../scripts/deploy-firebase.mjs';
import { PRODUCTION_PROJECT_IDS } from '../../scripts/firebase-projects.mjs';

test('--project が無ければ拒否', () => {
  assert.throws(() => checkDeploy({ project: null, only: 'hosting' }), /--project/);
});
test('許可リストは本案件の本番 ID だけ（2026-11-12 ユーザー作成。他案件の ID・demo- を入れない）', () => {
  assert.deepEqual([...PRODUCTION_PROJECT_IDS], ['afro-cms-4a6ff']);
  assert.doesNotThrow(() => checkDeploy({ project: 'afro-cms-4a6ff', only: 'hosting' }));
  assert.throws(() => checkDeploy({ project: 'some-other-prod', only: 'hosting' }), /許可リスト/);
});
test('TBD は許可リストに入っていても拒否', () => {
  assert.throws(() => checkDeploy({ project: 'TBD', only: 'hosting' }, ['TBD']), /許可リスト/);
});
test('許可リストに無い ID・demo- の ID は拒否', () => {
  const list = ['afro-cms-prod'];
  assert.throws(() => checkDeploy({ project: 'castfile-prod', only: 'hosting' }, list), /許可リスト/);
  assert.throws(() => checkDeploy({ project: 'demo-afro-cms', only: 'hosting' }, ['demo-afro-cms']), /エミュレータ専用/);
});
test('--only が無い・対象外を含むなら拒否', () => {
  const list = ['afro-cms-prod'];
  assert.throws(() => checkDeploy({ project: 'afro-cms-prod', only: null }, list), /--only/);
  assert.throws(() => checkDeploy({ project: 'afro-cms-prod', only: 'hosting,storage' }, list), /対象外/);
  assert.throws(() => checkDeploy({ project: 'afro-cms-prod', only: 'functions:other' }, list), /対象外/);
  assert.throws(() => checkDeploy({ project: 'afro-cms-prod', only: 'firestore' }, list), /対象外/);
});
test('functions は許可リストの ID でだけ通す（0.46.0。招待のアカウント作成）', () => {
  assert.deepEqual(checkDeploy({ project: 'afro-cms-prod', only: 'functions' }, ['afro-cms-prod']), { project: 'afro-cms-prod', targets: ['functions'] });
  assert.throws(() => checkDeploy({ project: 'castfile-prod', only: 'functions' }, ['afro-cms-prod']), /許可リスト/);
  assert.throws(() => checkDeploy({ project: 'demo-afro-cms', only: 'functions' }, ['demo-afro-cms']), /エミュレータ専用/);
});
test('functions と hosting を 1 回で出すのは拒否（functions を先に別で出す）', () => {
  assert.throws(() => checkDeploy({ project: 'afro-cms-prod', only: 'functions,hosting' }, ['afro-cms-prod']), /1 回で出せません/);
  assert.throws(() => checkDeploy({ project: 'afro-cms-prod', only: 'hosting,firestore:rules,functions' }, ['afro-cms-prod']), /1 回で出せません/);
  assert.doesNotThrow(() => checkDeploy({ project: 'afro-cms-prod', only: 'functions,firestore:rules' }, ['afro-cms-prod']));
});
test('許可リストと完全一致し、対象が許可内なら通す', () => {
  const r = checkDeploy({ project: 'afro-cms-prod', only: 'hosting,firestore:rules,firestore:indexes' }, ['afro-cms-prod']);
  assert.deepEqual(r, { project: 'afro-cms-prod', targets: ['hosting', 'firestore:rules', 'firestore:indexes'] });
});
test('引数の解析と不明な引数の拒否', () => {
  assert.deepEqual(parseDeployArgs(['--project', 'x', '--only=hosting', '--dry-run']), { project: 'x', only: 'hosting', dryRun: true });
  assert.throws(() => parseDeployArgs(['--force']), /不明な引数/);
});

// ---------- AI 下書きの MODE=on は法務の記録が無ければ止める（AI 計画 §5 L-c・T-11・SEC-H1。一時ディレクトリだけを使う） ----------
function aiEnvDir(files) {
  const dir = mkdtempSync(join(tmpdir(), 'afro-ai-legal-'));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  return dir;
}
test('AI 法務: MODE が off・internal・未設定なら記録が無くても通す', () => {
  const dir = aiEnvDir({ '.env.p1': 'AI_REQUIREMENTS_MODE=off\n' });
  const legalFile = join(dir, 'missing.md');
  try {
    assert.equal(checkAiLegalClearance('p1', { functionsDir: dir, legalFile }), 'off');
    writeFileSync(join(dir, '.env.p1'), 'AI_REQUIREMENTS_MODE=internal\n');
    assert.equal(checkAiLegalClearance('p1', { functionsDir: dir, legalFile }), 'internal');
    assert.equal(checkAiLegalClearance('p2', { functionsDir: dir, legalFile }), '');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('AI 法務: MODE=on で記録が無ければ拒否（.env.<project> が .env より優先・大文字・引用符・CRLF も on）', () => {
  const dir = aiEnvDir({ '.env': 'AI_REQUIREMENTS_MODE=off\n', '.env.p1': '# c\r\nAI_REQUIREMENTS_MODE=" ON "\r\n' });
  try {
    assert.throws(() => checkAiLegalClearance('p1', { functionsDir: dir, legalFile: join(dir, 'missing.md') }), /LEGAL_CLEARANCE/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('AI 法務: MODE=on でも記録があれば通す', () => {
  const dir = aiEnvDir({ '.env.p1': 'AI_REQUIREMENTS_MODE=on\n', 'clearance.md': '# test\n' });
  try {
    assert.equal(checkAiLegalClearance('p1', { functionsDir: dir, legalFile: join(dir, 'clearance.md') }), 'on');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---------- サイトマップの AI_SITEMAP_MODE=on は法務の記録に行「AI-SCOPE: sitemap」が要る（LIVE_SITEMAP_AI.md §7・IMPL_PLAN sec M-3・SM-28） ----------
const SCOPE_CASES = [
  ['行として在る', '# 法務\nAI-SCOPE: sitemap\n', true],
  ['カンマ区切りの対象の 1 つ', '# 法務\nAI-SCOPE: requirements, sitemap\n', true],
  ['CRLF・前後の空白', '# 法務\r\nAI-SCOPE:   sitemap  \r\n', true],
  ['散文中の言及だけ', '# 法務\n本文では AI-SCOPE: sitemap を書く予定（未決）\n', false],
  ['sitemap-draft', 'AI-SCOPE: sitemap-draft\n', false],
  ['sitemaps', 'AI-SCOPE: sitemaps\n', false],
  ['要件定義書の記録だけ', 'AI-SCOPE: requirements\n', false],
  ['行頭の飾り（箇条書き）', '- AI-SCOPE: sitemap\n', false],
  ['行頭のバッククォート', '`AI-SCOPE: sitemap`\n', false],
  ['大文字の対象', 'AI-SCOPE: Sitemap\n', false],
  ['空のファイル', '', false],
  // sec L-3: コードブロックの中（書き方の例）は数えない。閉じた後の行は数える。閉じないブロックの中も数えない
  ['コードブロックの中', '# 法務\n書き方:\n```\nAI-SCOPE: sitemap\n```\n', false],
  ['~~~ のコードブロックの中', '~~~md\r\nAI-SCOPE: sitemap\r\n~~~\r\n', false],
  ['閉じないコードブロックの中', '```\nAI-SCOPE: sitemap\n', false],
  ['コードブロックの後の行', '```\nAI-SCOPE: sitemap\n```\nAI-SCOPE: sitemap\n', true],
];
for (const [name, body, ok] of SCOPE_CASES) {
  test(`AI 法務（サイトマップ）: ${name} → ${ok ? '許可' : '拒否'}`, () => {
    assert.equal(hasAiScopeLine(body, 'sitemap'), ok);
    const dir = aiEnvDir({ '.env.p1': 'AI_REQUIREMENTS_MODE=internal\nAI_SITEMAP_MODE=on\n', 'clearance.md': body });
    const legalFile = join(dir, 'clearance.md');
    try {
      if (ok) {
        assert.equal(checkAiSitemapLegalClearance('p1', { functionsDir: dir, legalFile }), 'on');
        assert.equal(checkAiLegalClearance('p1', { functionsDir: dir, legalFile }), 'internal');
      } else {
        assert.throws(() => checkAiSitemapLegalClearance('p1', { functionsDir: dir, legalFile }), /AI-SCOPE: sitemap/);
        assert.throws(() => checkAiLegalClearance('p1', { functionsDir: dir, legalFile }), /AI_SITEMAP_MODE=on/);
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}
test('AI 法務（サイトマップ）: AI_SITEMAP_MODE=on で記録ファイルが無ければ拒否（.env.<project> が優先・大文字・引用符も on）', () => {
  const dir = aiEnvDir({ '.env': 'AI_SITEMAP_MODE=off\n', '.env.p1': 'AI_SITEMAP_MODE=" ON "\r\n' });
  try {
    assert.throws(() => checkAiLegalClearance('p1', { functionsDir: dir, legalFile: join(dir, 'missing.md') }), /AI-SCOPE: sitemap/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('AI 法務（サイトマップ）: off・internal・未設定なら記録が無くても通す（要件定義書の判定は変わらない）', () => {
  const dir = aiEnvDir({ '.env.p1': 'AI_SITEMAP_MODE=off\n' });
  const legalFile = join(dir, 'missing.md');
  try {
    assert.equal(checkAiSitemapLegalClearance('p1', { functionsDir: dir, legalFile }), 'off');
    writeFileSync(join(dir, '.env.p1'), 'AI_SITEMAP_MODE=internal\n');
    assert.equal(checkAiSitemapLegalClearance('p1', { functionsDir: dir, legalFile }), 'internal');
    assert.equal(checkAiSitemapLegalClearance('p2', { functionsDir: dir, legalFile }), '');
    // 要件定義書が on で記録ファイルだけある（AI-SCOPE 行なし）でも、サイトマップが off なら通す
    writeFileSync(join(dir, '.env.p1'), 'AI_REQUIREMENTS_MODE=on\nAI_SITEMAP_MODE=off\n');
    writeFileSync(legalFile, '# 要件定義書の法務\n');
    assert.equal(checkAiLegalClearance('p1', { functionsDir: dir, legalFile }), 'on');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('本番の functions/.env.afro-cms-4a6ff は AI_SITEMAP_MODE=off（U-F2。internal へ変えるのはユーザー GO 後）', () => {
  assert.equal(checkAiSitemapLegalClearance('afro-cms-4a6ff'), 'off');
});
