// デプロイスクリプトの事前確認（checkHostingBuild・checkLiveAiFlag・parseTestCounts）。何も送らない・エミュレータに触らない。
// 偽の dist は OS の一時ディレクトリに作り、テストごとに消す（実際の dist-live は読まない）。
// 実行: npm run test:rules（deploy-guard.test.mjs と同じ置き場）。単独なら node --test tests/rules/deploy-build.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkHostingBuild, checkLiveAiFlag, parseTestCounts } from '../../scripts/deploy-firebase.mjs';

const PROJECT = 'afro-cms-prod';
const OTHER = 'afro-cms-other';
const LIST = [PROJECT, OTHER, 'TBD'];

/** files: { 'index.html': '...', 'assets/a.js': '...' }。index.html は既定で作る（null で作らない） */
function withDist(files, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'afro-cms-dist-'));
  try {
    const all = { 'index.html': '<!doctype html>', ...files };
    for (const [rel, body] of Object.entries(all)) {
      if (body === null) continue;
      const p = join(dir, ...rel.split('/'));
      mkdirSync(join(p, '..'), { recursive: true });
      writeFileSync(p, body);
    }
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---- checkHostingBuild ----

test('checkHostingBuild: index.html が無ければ拒否（build:live 前）', () => {
  withDist({ 'index.html': null, 'assets/a.js': `const p="${PROJECT}";` }, (dir) => {
    assert.throws(() => checkHostingBuild(PROJECT, dir, LIST), /index\.html がありません/);
  });
});

test('checkHostingBuild: 指定プロジェクトの ID が引用符つきで入っていれば通す（" \' ` の 3 種）', () => {
  for (const q of ['"', "'", '`']) {
    withDist({ 'assets/index-abc.js': `const cfg={projectId:${q}${PROJECT}${q}};` }, (dir) => {
      assert.doesNotThrow(() => checkHostingBuild(PROJECT, dir, LIST), `quote ${q}`);
    });
  }
});

test('checkHostingBuild: ID が引用符なし・部分一致だけなら別プロジェクト向けとして拒否', () => {
  withDist({ 'assets/a.js': `// ${PROJECT}\nconst p="${PROJECT}-staging";` }, (dir) => {
    assert.throws(() => checkHostingBuild(PROJECT, dir, LIST), /向けのビルドではありません/);
  });
});

test('checkHostingBuild: assets が無い・.js が無いなら拒否', () => {
  withDist({}, (dir) => {
    assert.throws(() => checkHostingBuild(PROJECT, dir, LIST), /向けのビルドではありません/);
  });
  withDist({ 'assets/a.css': `.x{content:"${PROJECT}"}` }, (dir) => {
    assert.throws(() => checkHostingBuild(PROJECT, dir, LIST), /向けのビルドではありません/);
  });
});

test('checkHostingBuild: エミュレータの接続先（8080 / 9099 / 5001）が JS にあれば拒否', () => {
  for (const host of ['127.0.0.1:8080', '127.0.0.1:9099', '127.0.0.1:5001']) {
    withDist({ 'assets/a.js': `const p="${PROJECT}";`, 'assets/b.js': `fetch("http://${host}/x")` }, (dir) => {
      assert.throws(() => checkHostingBuild(PROJECT, dir, LIST), /エミュレータの接続先/, host);
    });
  }
});

test('checkHostingBuild: エミュレータ検査はプロジェクト ID の検査より先（ID が合っていても拒否）', () => {
  withDist({ 'assets/a.js': `const p="${PROJECT}";const h="127.0.0.1:9099";` }, (dir) => {
    assert.throws(() => checkHostingBuild(PROJECT, dir, LIST), /エミュレータの接続先/);
  });
});

test('checkHostingBuild: 許可リストの別プロジェクトの ID も入っていれば拒否', () => {
  withDist({ 'assets/a.js': `const p="${PROJECT}";`, 'assets/b.js': `const q='${OTHER}';` }, (dir) => {
    assert.throws(() => checkHostingBuild(PROJECT, dir, LIST), new RegExp(`別のプロジェクトの ID（${OTHER}）`));
  });
});

test('checkHostingBuild: 許可リストの TBD が JS に入っていても別プロジェクト扱いしない', () => {
  withDist({ 'assets/a.js': `const p="${PROJECT}";const s="TBD";` }, (dir) => {
    assert.doesNotThrow(() => checkHostingBuild(PROJECT, dir, LIST));
  });
});

// ---- parseTestCounts ----

test('parseTestCounts: spec レポーターの要約（ℹ）を読む', () => {
  const out = ['▶ rules', '  ✔ a (1ms)', 'ℹ tests 12', 'ℹ suites 0', 'ℹ pass 11', 'ℹ fail 1', 'ℹ cancelled 0'].join('\n');
  assert.deepEqual(parseTestCounts(out), { tests: 12, pass: 11, fail: 1 });
});

test('parseTestCounts: TAP の要約（#）を読む', () => {
  const out = ['TAP version 13', 'ok 1 - a', '1..3', '# tests 3', '# pass 3', '# fail 0'].join('\n');
  assert.deepEqual(parseTestCounts(out), { tests: 3, pass: 3, fail: 0 });
});

test('parseTestCounts: 0 件は 0 として読む（null と区別する）', () => {
  assert.deepEqual(parseTestCounts('ℹ tests 0\nℹ pass 0\nℹ fail 0\n'), { tests: 0, pass: 0, fail: 0 });
});

test('parseTestCounts: 要約が無ければ null（エミュレータが起動しなかった等）', () => {
  assert.deepEqual(parseTestCounts('Error: Could not start Firestore Emulator\n'), { tests: null, pass: null, fail: null });
  assert.deepEqual(parseTestCounts(''), { tests: null, pass: null, fail: null });
});

test('parseTestCounts: 本文中の "tests" "pass" という語（要約記号なし）を件数にしない', () => {
  const out = 'running tests 5 files\npass 9 through\nℹ tests 2\nℹ pass 2\nℹ fail 0';
  assert.deepEqual(parseTestCounts(out), { tests: 2, pass: 2, fail: 0 });
});

test('parseTestCounts: CRLF の出力（Windows）でも読む', () => {
  assert.deepEqual(parseTestCounts('ℹ tests 4\r\nℹ pass 4\r\nℹ fail 0\r\n'), { tests: 4, pass: 4, fail: 0 });
});

// ---- checkLiveAiFlag（2026-11-26: .env.live.local からフラグが抜けて本番の AI 画面が黙って off になった） ----

function withEnv(body, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'afro-cms-env-'));
  try {
    const file = join(dir, '.env.live.local');
    if (body !== null) writeFileSync(file, body);
    return fn(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('checkLiveAiFlag: ファイルが無い・キーが無い・値が空なら拒否', () => {
  withEnv(null, (f) => assert.throws(() => checkLiveAiFlag(f), /VITE_FEATURE_AI_REQUIREMENTS がありません/));
  withEnv('VITE_FIREBASE_PROJECT_ID=x\n', (f) => assert.throws(() => checkLiveAiFlag(f), /がありません/));
  withEnv('VITE_FEATURE_AI_REQUIREMENTS=\n', (f) => assert.throws(() => checkLiveAiFlag(f), /がありません/));
});

test('checkLiveAiFlag: off / internal / on は明示されていれば通して値を返す（引用符・CRLF・後の行が優先）', () => {
  withEnv('VITE_FEATURE_AI_REQUIREMENTS=off\n', (f) => assert.equal(checkLiveAiFlag(f), 'off'));
  withEnv('A=1\r\nVITE_FEATURE_AI_REQUIREMENTS="internal"\r\n', (f) => assert.equal(checkLiveAiFlag(f), 'internal'));
  withEnv('VITE_FEATURE_AI_REQUIREMENTS=off\nVITE_FEATURE_AI_REQUIREMENTS=on\n', (f) => assert.equal(checkLiveAiFlag(f), 'on'));
});

test('checkLiveAiFlag: 3 つ以外の値は拒否', () => {
  withEnv('VITE_FEATURE_AI_REQUIREMENTS=Internal\n', (f) => assert.throws(() => checkLiveAiFlag(f), /不正です/));
  withEnv('VITE_FEATURE_AI_REQUIREMENTS=true\n', (f) => assert.throws(() => checkLiveAiFlag(f), /不正です/));
});
