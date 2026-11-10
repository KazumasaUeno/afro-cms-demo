import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CssBaseline, ThemeProvider } from '@mui/material';
// Roboto は端末にあれば使い、無ければ Noto Sans JP の欧文で表示する（新しい依存を増やさない）
import '@fontsource/noto-sans-jp/400.css';
import '@fontsource/noto-sans-jp/500.css';
import '@fontsource/noto-sans-jp/700.css';
import './global.css';
import { theme } from '@/theme/theme';
import { DemoStoreProvider } from '@/store/DemoStore';
import { ToastProvider } from '@/hooks/useToast';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <DemoStoreProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </DemoStoreProvider>
    </ThemeProvider>
  </StrictMode>,
);
