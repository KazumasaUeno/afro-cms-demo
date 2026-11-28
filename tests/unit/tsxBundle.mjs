// 単体テストから .tsx（画面の部品）を読むための小さな束ね（rolldown。vite 8 の依存で入っている＝依存の追加なし）。
// src の @/ を解決し、CSS は空にし、外部パッケージ（react・@mui・@xyflow など）は node_modules のまま読む。
// import.meta.env は空のオブジェクト（DATA_MODE は既定の demo）。出力は node_modules/.cache/unit-tsx に置き（外部パッケージを通常どおり解決させるため）、import して返す。
// 使い方: const mod = await importTsxSource('export { X } from "@/features/..."')
import { rolldown } from 'rolldown';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = path.join(root, 'src');
const out = path.join(root, 'node_modules', '.cache', 'unit-tsx');

function pick(base) {
  for (const c of [base, `${base}.tsx`, `${base}.ts`, path.join(base, 'index.tsx'), path.join(base, 'index.ts')]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

const CSS_STUB = '\0unit-css-stub';
const plugin = {
  name: 'unit-tsx',
  resolveId(spec, importer) {
    if (spec.endsWith('.css')) return CSS_STUB;
    if (spec.startsWith('@/')) return pick(path.join(src, spec.slice(2)));
    if (path.isAbsolute(spec)) return pick(spec);
    if (spec.startsWith('.') && importer) return pick(path.resolve(path.dirname(importer), spec));
    // React は 1 つの実体を共有する（外のまま）。それ以外のパッケージは束ねる（@mui の deep import を node の ESM が解決できないため）
    if (/^(react|react-dom)(\/|$)/.test(spec)) return { id: spec, external: true };
    return null;
  },
  load(id) {
    return id === CSS_STUB ? 'export {};' : null;
  },
};

let n = 0;
/** 文字列の entry を束ねて import する（entry の中の import は @/ か絶対パスで書く） */
export async function importTsxSource(code) {
  fs.mkdirSync(out, { recursive: true });
  const tag = `${process.pid}-${Date.now()}-${n++}`;
  const entry = path.join(out, `entry-${tag}.tsx`);
  fs.writeFileSync(entry, code);
  const bundle = await rolldown({
    input: entry, plugins: [plugin], platform: 'node', logLevel: 'silent',
    transform: { define: { 'import.meta.env': '{}' }, jsx: { runtime: 'automatic' } },
  });
  const { output } = await bundle.generate({ format: 'esm', codeSplitting: false });
  await bundle.close();
  const file = path.join(out, `bundle-${tag}.mjs`);
  fs.writeFileSync(file, output[0].code);
  try {
    return await import(pathToFileURL(file).href);
  } finally {
    fs.rmSync(entry, { force: true });
    fs.rmSync(file, { force: true });
  }
}
