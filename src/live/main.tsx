import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/noto-sans-jp/400.css';
import '@fontsource/noto-sans-jp/500.css';
import '@fontsource/noto-sans-jp/700.css';
import '../global.css';
import { ThemeModeProvider } from '@/theme/ThemeMode';
import { ToastProvider } from '@/hooks/useToast';
import { registerLiveRepositories } from '@/repositories';
import { LiveAuthProvider } from './auth';
import { useLiveRepositoriesImpl } from './repositories';
import LiveApp from './LiveApp';

/**
 * live モードの入口（index.html の入口を vite.config.ts の afro-live-html が差し替える）。
 * demo の DemoStore・SESSION_KEY・localStorage の状態は読まない（BACKEND_PLAN C3）。
 * 画面の useRepositories() は、ここで登録した Firestore の実装を使う（LiveDataProvider の内側でだけ呼ばれる）
 */
registerLiveRepositories(useLiveRepositoriesImpl);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeModeProvider>
      <ToastProvider>
        <LiveAuthProvider>
          <LiveApp />
        </LiveAuthProvider>
      </ToastProvider>
    </ThemeModeProvider>
  </StrictMode>,
);
