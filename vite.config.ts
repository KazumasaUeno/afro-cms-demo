import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 5180 },
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
