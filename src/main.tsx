import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CssBaseline, ThemeProvider } from '@mui/material';
import '@fontsource-variable/inter';
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
