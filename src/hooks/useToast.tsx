import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Snackbar, Box } from '@mui/material';
import { AlertTriangle, CheckCircle2, Info, Sparkles } from 'lucide-react';
import { tokens } from '@/theme/tokens';

/** error: 書き込みの失敗（live で Rules に拒否された・オフライン。demo では出ない） */
export type Tone = 'success' | 'info' | 'ai' | 'error';
interface ToastItem { id: number; message: string; tone: Tone }

const ToastContext = createContext<(message: string, tone?: Tone) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [item, setItem] = useState<ToastItem | null>(null);
  const [open, setOpen] = useState(false);
  const show = useCallback((message: string, tone: Tone = 'success') => {
    setItem({ id: Date.now(), message, tone });
    setOpen(true);
  }, []);
  const Icon = item?.tone === 'ai' ? Sparkles : item?.tone === 'info' ? Info : item?.tone === 'error' ? AlertTriangle : CheckCircle2;
  const color = item?.tone === 'ai' ? tokens.color.accent : item?.tone === 'info' ? tokens.color.info : item?.tone === 'error' ? tokens.color.dangerLine : tokens.color.success;
  // スマホ: 下部タブの上。画面の下部に固定のバーがある間は、その画面が --toast-bottom でバーの上へ上げる（HearingEditor）
  return (
    <ToastContext.Provider value={show}>
      {children}
      <Snackbar key={item?.id} open={open} sx={{ bottom: { xs: 'var(--toast-bottom, calc(74px + env(safe-area-inset-bottom)))', md: 24 } }} autoHideDuration={3200} onClose={(_, r) => r !== 'clickaway' && setOpen(false)}>
        <Box
          role={item?.tone === 'error' ? 'alert' : 'status'}
          sx={{
            display: 'flex', alignItems: 'center', gap: 1.25, px: 2, py: 1.5, minHeight: 48, borderRadius: 1, // M3 Snackbar
            bgcolor: tokens.color.inverseSurface, color: tokens.color.inverseOnSurface, boxShadow: tokens.shadow.lg, fontSize: 14, fontWeight: 400, maxWidth: 'calc(100vw - 32px)',
          }}
        >
          <Icon size={18} color={color} style={{ flexShrink: 0 }} />
          {item?.message}
        </Box>
      </Snackbar>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
