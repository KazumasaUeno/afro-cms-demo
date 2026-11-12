import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { fileURLToPath, URL } from 'node:url';

/**
 * データモード（BACKEND_PLAN C1・C2）は **vite の --mode だけ**で決める（.env.local の値では切り替わらない＝demo の回帰 ⑦）。
 * - 既定（`vite` / `vite build`）: demo。Firebase のコードは tree-shake で dist に入らない
 * - `--mode live`: Firebase Hosting 用（設定は .env.live.local の VITE_FIREBASE_*。無ければビルドを失敗させる）
 * - `--mode emulator`: エミュレータ（demo-afro-cms）専用。接続先 127.0.0.1 の分岐はこのモードのビルドにだけ残る
 */
const LIVE_MODES = ['live', 'emulator'];
const EMULATOR_PROJECT_ID = 'demo-afro-cms';
const REQUIRED_FIREBASE_KEYS = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID'];

/**
 * live / emulator の index.html（C4）。
 * - 入口を src/live/main.tsx に差し替える（demo の src/main.tsx は変えない。demo の App.tsx は読み込んだ時点でルーターを作るので、
 *   同じ入口から分岐すると live でも demo のルーターが動く）
 * - ビルドのときだけ CSP（meta）を入れる。インラインの配色スクリプトは sha256 で許可する（dev サーバーは HMR のため入れない）
 */
function liveHtml(emulator: boolean, build: boolean): Plugin {
  return {
    name: 'afro-live-html',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        let out = html
          .replace('src="/src/main.tsx"', 'src="/src/live/main.tsx"')
          .replace(/<title>[^<]*<\/title>/, `<title>アフロCMS${emulator ? '（エミュレータ）' : ''}</title>`);
        if (!out.includes('/src/live/main.tsx')) throw new Error('index.html の入口（/src/main.tsx）が見つかりません');
        if (!build) return out;
        const scripts = [...out.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`);
        const connect = ["'self'", 'https://firestore.googleapis.com', 'https://identitytoolkit.googleapis.com', 'https://securetoken.googleapis.com'];
        if (emulator) connect.push('http://127.0.0.1:8080', 'ws://127.0.0.1:8080', 'http://127.0.0.1:9099');
        const csp = [
          "default-src 'self'",
          `script-src 'self' ${scripts.join(' ')}`,
          // MUI（emotion）が style 要素を差し込むため
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob:",
          "font-src 'self' data:",
          `connect-src ${connect.join(' ')}`,
          "frame-src 'none'",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join('; ');
        out = out.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />`);
        return out;
      },
    },
  };
}

export default defineConfig(({ mode, command }) => {
  const live = LIVE_MODES.includes(mode);
  const emulator = mode === 'emulator';
  if (live && command === 'build') {
    const env = loadEnv(mode, process.cwd(), 'VITE_FIREBASE_');
    if (emulator) {
      if (env.VITE_FIREBASE_PROJECT_ID && env.VITE_FIREBASE_PROJECT_ID !== EMULATOR_PROJECT_ID) {
        throw new Error(`emulator のビルドは projectId=${EMULATOR_PROJECT_ID} だけ（${env.VITE_FIREBASE_PROJECT_ID} が指定されています）`);
      }
    } else {
      const missing = REQUIRED_FIREBASE_KEYS.filter((k) => !env[k]?.trim());
      if (missing.length) throw new Error(`live のビルドに必要な設定がありません: ${missing.join(', ')}（.env.live.local。.env.example を参照）`);
      if (env.VITE_FIREBASE_PROJECT_ID.startsWith('demo-')) throw new Error('live のビルドに demo- のプロジェクトは使えません（--mode emulator を使う）');
    }
  }
  return {
    // GitHub Pages 用のビルドだけサブパスにする（.github/workflows/pages.yml が VITE_BASE を渡す）
    base: process.env.VITE_BASE ?? '/',
    plugins: [react(), ...(live ? [liveHtml(emulator, command === 'build')] : [])],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    // ビルド時定数（文字列で置き換える）。demo では `'demo' === 'live'` が偽になり、live の import ごと落ちる
    define: {
      'import.meta.env.VITE_DATA_MODE': JSON.stringify(live ? 'live' : 'demo'),
      'import.meta.env.VITE_FIREBASE_EMULATOR': JSON.stringify(emulator ? '1' : '0'),
    },
    server: { port: 5180 },
    // 共有用（npm run share）: Cloudflare の一時トンネル経由のアクセスだけを許可する
    preview: { port: 4173, allowedHosts: ['.trycloudflare.com'] },
    build: {
      outDir: mode === 'live' ? 'dist-live' : emulator ? 'dist-emulator' : 'dist',
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('@xyflow')) return 'flow';
            if (id.includes('@tiptap') || id.includes('prosemirror')) return 'editor';
            if (id.includes('recharts') || id.includes('d3-')) return 'charts';
            if (id.includes('@mui') || id.includes('@emotion')) return 'mui';
            if (id.includes('/firebase/') || id.includes('@firebase')) return 'firebase';
            return undefined;
          },
        },
      },
    },
  };
});
