// 2026-11-28 0.52.0 の後の修正（docs/reviews/2026-11-28-post-0-52-fixes.md）。React・Firebase を import しない。
//   O-2: WBS・予定日の保存が競合したら、下書き・入力画面を捨てて最新を出す（文言「最新を読み込みました」と合わせる）
//   O-1: ガントの月の見出しが重ならない（幅 320 のお客様ポータル）。重ならない幅では従来と同じ
//   SEED: seed-emulator-reqdoc の edited がサーバーの検査（validateEditableV3）に通る
// 実行: npm run test:unit
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { closesAfterSave } from '../../src/features/schedule/scheduleSource.ts';
import { monthLabelWidth, monthLabels } from '../../src/features/schedule/ganttMonths.ts';
import { shiftYmd } from '../../src/data/schedule.ts';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

/* ---------- O-2 ---------- */

test('O-2 closesAfterSave: 保存できた・競合は入力画面を閉じる、失敗は開いたまま', () => {
  assert.equal(closesAfterSave(true), true);
  assert.equal(closesAfterSave('conflict'), true);
  assert.equal(closesAfterSave(false), false);
});

test('O-2 配線: live の保存は競合を conflict で返し、WBS は最新へ置き換え、予定日の入力画面は閉じる', () => {
  const page = read('src/live/pages/LiveSchedulePage.tsx');
  // WBS の保存（useLiveWbsSource）と予定日の run の両方が ScheduleConflictError を 'conflict' にする
  assert.equal((page.match(/e instanceof ScheduleConflictError \? 'conflict' : false/g) ?? []).length, 2);
  // 理由のダイアログは true のときだけ閉じる（'conflict' を真として閉じない）。再計画の競合だけ閉じて最新を出す
  assert.ok(page.includes("if (ok === true) closeNote(true);"));
  assert.ok(page.includes("else if (ok === 'conflict' && note.kind === 'reopen') closeNote('conflict');"));
  assert.ok(!/if \(ok\) closeNote\(true\)/.test(page));

  const wbs = read('src/features/schedule/WbsSection.tsx');
  const i = wbs.indexOf("if (ok === 'conflict') { resetToLatest(); return; }");
  const j = wbs.indexOf('if (!ok) return;', i);
  assert.ok(i > 0 && j > i, '競合は失敗より先に判定して最新へそろえる');
  // 最新は応答の時点の値（保存を押した時点の items ではない）
  assert.ok(wbs.includes('latest.current = { items, done: savedDone };'));
  assert.ok(/const resetToLatest = \(\) => \{\s*setDraft\(latest\.current\.items\);\s*setDoneDraft\(latest\.current\.done\);/.test(wbs));
  // token はこれまでどおり dirty でない間だけ追従（置き換えた後は dirty でなくなり追従する）
  assert.ok(wbs.includes('if (liveToken !== undefined && !dirty && !editing) setToken(liveToken);'));

  const view = read('src/features/schedule/ScheduleView.tsx');
  assert.ok(view.includes('void r.then((res) => { if (closesAfterSave(res)) done(); });'));
  // demo（同期の true / false）はそのまま
  assert.ok(view.includes('if (r === true) done();'));
});

/* ---------- O-1 ---------- */

/** 修正前の式（WbsSection.tsx:239。重なりを見ない） */
function before(from, days, dayPx) {
  const out = [];
  for (let i = 0; i < days; i++) {
    const [y, m, d] = shiftYmd(from, i).split('-').map(Number);
    if (i === 0 || d === 1) out.push({ at: i * dayPx, label: i === 0 || m === 1 ? `${y}年${m}月` : `${m}月` });
  }
  return out;
}
// すき間 4px 未満も「重なり」とみなす（ganttMonths.ts の GAP）
const overlaps = (ls) => ls.some((l, k) => k > 0 && ls[k - 1].at + 4 + monthLabelWidth(ls[k - 1].label) + 4 > l.at + 4);

test('O-1 monthLabelWidth: 実測（「2026年11月」70px）と合う', () => {
  assert.equal(monthLabelWidth('2026年11月'), 70);
  assert.equal(monthLabelWidth('12月'), 27.5);
});

test('O-1 幅 320 のお客様（QA の実測: 11月の見出し x170〜240・12月 x224）: 修正前は重なり、修正後は重ならない', () => {
  // 先頭から 12/1 まで 9 日・1 日 6px（12月の見出しが 54px の位置）
  const from = '2026-11-22';
  assert.ok(overlaps(before(from, 60, 6)), '修正前は重なる');
  const after = monthLabels(from, 60, 6);
  assert.ok(!overlaps(after));
  assert.deepEqual(after.slice(0, 2).map((l) => l.label), ['11月', '2026年12月'], '先頭は月だけ・年は次へ');
});

test('O-1 先頭が「月」だけでも入らない（月初の直前）: 先頭を出さず、年は次の見出しへ', () => {
  const after = monthLabels('2026-11-28', 40, 6);
  assert.equal(after[0].label, '2026年12月');
  assert.equal(after[0].at, 3 * 6);
  assert.ok(!overlaps(after));
});

test('O-1 次が 1 月（元から年つき）: 年を二重にしない', () => {
  const after = monthLabels('2026-12-29', 40, 6);
  assert.deepEqual(after.map((l) => l.label), ['2027年1月', '2月']);
});

test('O-1 重ならない幅（390 / 768 / 1280 相当の 1 日の幅）では修正前と同じ', () => {
  const cases = [];
  for (const dayPx of [6, 8, 10, 12, 16, 20]) {
    for (const start of ['2026-11-01', '2026-11-15', '2026-11-20', '2026-12-10', '2027-01-03']) {
      for (const days of [30, 60, 90]) {
        const b = before(start, days, dayPx);
        if (!overlaps(b)) cases.push([start, days, dayPx, b]);
      }
    }
  }
  assert.ok(cases.length > 50);
  for (const [start, days, dayPx, b] of cases) assert.deepEqual(monthLabels(start, days, dayPx), b, `${start} ${days}日 ${dayPx}px`);
});

test('O-1 配線: WbsSection は monthLabels を使い、元の式を持たない', () => {
  const src = read('src/features/schedule/WbsSection.tsx');
  assert.ok(src.includes('const months = monthLabels(from, days, dayPx);'));
  assert.ok(!src.includes('months.push('));
});

/* ---------- SEED ---------- */

// サーバーの検査（functions/src/ai/reqDocEditable.ts）はクラスの引数プロパティを使うので型除去だけでは読めない。
// --experimental-transform-types の子プロセスで、seed が入れる generated と edited をそのまま検査する
test('SEED: seed-emulator-reqdoc の edited（draft・analyzed・approved）がサーバーの検査 validateEditableV3 に通る', () => {
  const root = fileURLToPath(new URL('../..', import.meta.url));
  const code = `
    const { seedDraftOf, SITES } = await import(${JSON.stringify(pathToFileURL(join(root, 'scripts', 'seed-emulator-reqdoc.mjs')).href)});
    const { validateEditableV3 } = await import(${JSON.stringify(pathToFileURL(join(root, 'functions', 'src', 'ai', 'reqDocEditable.ts')).href)});
    const out = {};
    for (const s of Object.values(SITES)) {
      const { g, e } = seedDraftOf(s);
      try { validateEditableV3(e, g); out[s.pid] = 'ok'; } catch (x) { out[s.pid] = String(x.field ?? x.message); }
    }
    console.log(JSON.stringify(out));`;
  const r = spawnSync(process.execPath, [
    '--experimental-transform-types', '--no-warnings', '--import', pathToFileURL(join(root, 'tests', 'unit', 'register.mjs')).href,
    '--input-type=module', '-e', code,
  ], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout.trim().split('\n').pop()), { 'reqdoc-v3-draft': 'ok', 'reqdoc-v3-approved': 'ok', 'reqdoc-v3-analyzed': 'ok' });
});

test('競合で最新へ戻すとき編集ダイアログも閉じる（code review 2026-11-28 Minor）', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../../src/features/schedule/WbsSection.tsx', import.meta.url), 'utf8');
  const i = src.indexOf('const resetToLatest = () => {');
  assert.ok(i > 0 && src.slice(i, i + 400).includes('setEditing(null);'));
});
