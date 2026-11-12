import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/noto-sans-jp/400.css';
import '@fontsource/noto-sans-jp/500.css';
import '@fontsource/noto-sans-jp/700.css';
import '../global.css';
import { ThemeModeProvider } from '@/theme/ThemeMode';
import { ToastProvider } from '@/hooks/useToast';
import { app } from './firebase';

/**
 * live モードの入口（index.html の入口を vite.config.ts の afro-live-html が差し替える）。
 * demo の DemoStore・SESSION_KEY・localStorage の状態は読まない（BACKEND_PLAN C3）
 */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeModeProvider>
      <ToastProvider>
        <p style={{ padding: 24 }}>live モード（{app.options.projectId}）は準備中です。</p>
      </ToastProvider>
    </ThemeModeProvider>
  </StrictMode>,
);
