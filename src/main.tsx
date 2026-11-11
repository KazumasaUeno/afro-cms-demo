import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Roboto は端末にあれば使い、無ければ Noto Sans JP の欧文で表示する（新しい依存を増やさない）
import '@fontsource/noto-sans-jp/400.css';
import '@fontsource/noto-sans-jp/500.css';
import '@fontsource/noto-sans-jp/700.css';
import './global.css';
import { ThemeModeProvider } from '@/theme/ThemeMode';
import { DemoStoreProvider } from '@/store/DemoStore';
import { ToastProvider } from '@/hooks/useToast';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* 配色の切替は「動きを減らす」設定（DemoState）を見るので、DemoStore の内側に置く */}
    <DemoStoreProvider>
      <ThemeModeProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </ThemeModeProvider>
    </DemoStoreProvider>
  </StrictMode>,
);
