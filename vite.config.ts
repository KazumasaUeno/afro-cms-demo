import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  // GitHub Pages 用のビルドだけサブパスにする（.github/workflows/pages.yml が VITE_BASE を渡す）
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 5180 },
  // 共有用（npm run share）: Cloudflare の一時トンネル経由のアクセスだけを許可する
  preview: { port: 4173, allowedHosts: ['.trycloudflare.com'] },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@xyflow')) return 'flow';
          if (id.includes('@tiptap') || id.includes('prosemirror')) return 'editor';
          if (id.includes('recharts') || id.includes('d3-')) return 'charts';
          if (id.includes('@mui') || id.includes('@emotion')) return 'mui';
          return undefined;
        },
      },
    },
  },
});
