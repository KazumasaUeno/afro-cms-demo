// 単体テストの resolve hook（scripts/gen-rules-questions.mjs:18-37 と同じ規則）。
//   node --experimental-strip-types --no-warnings --import ./tests/unit/register.mjs --test "tests/unit/*.test.mjs"（npm run test:unit）
// `@/x/y` → src/x/y.ts（無ければ .tsx / index.ts）。拡張子なしの相対 import にも .ts を補う
import { register } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const hook = `
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
const SRC = ${JSON.stringify(join(root, 'src'))};
function pick(base) {
  for (const c of [base + '.ts', base + '.tsx', base + '/index.ts']) if (existsSync(c)) return c;
  return null;
}
export async function resolve(spec, ctx, next) {
  if (spec.startsWith('@/')) {
    const f = pick(SRC + '/' + spec.slice(2));
    if (f) return { url: pathToFileURL(f).href, shortCircuit: true };
  }
  if ((spec.startsWith('./') || spec.startsWith('../')) && ctx.parentURL && ctx.parentURL.endsWith('.ts') && !/\\.[a-z]+$/.test(spec)) {
    const f = pick(fileURLToPath(new URL(spec, ctx.parentURL)));
    if (f) return { url: pathToFileURL(f).href, shortCircuit: true };
  }
  return next(spec, ctx);
}`;

register(`data:text/javascript,${encodeURIComponent(hook)}`, import.meta.url);
