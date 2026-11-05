import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Snackbar, Box } from '@mui/material';
import { CheckCircle2, Info, Sparkles } from 'lucide-react';
import { tokens } from '@/theme/tokens';

type Tone = 'success' | 'info' | 'ai';
interface ToastItem { id: number; message: string; tone: Tone }

const ToastContext = createContext<(message: string, tone?: Tone) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [item, setItem] = useState<ToastItem | null>(null);
  const [open, setOpen] = useState(false);
  const show = useCallback((message: string, tone: Tone = 'success') => {
    setItem({ id: Date.now(), message, tone });
    setOpen(true);
  }, []);
  const Icon = item?.tone === 'ai' ? Sparkles : item?.tone === 'info' ? Info : CheckCircle2;
  const color = item?.tone === 'ai' ? tokens.color.accent : item?.tone === 'info' ? tokens.color.info : tokens.color.success;
  return (
    <ToastContext.Provider value={show}>
      {children}
      <Snackbar key={item?.id} open={open} sx={{ bottom: { xs: 'calc(74px + env(safe-area-inset-bottom))', md: 24 } }} autoHideDuration={3200} onClose={(_, r) => r !== 'clickaway' && setOpen(false)}>
        <Box
          role="status"
          sx={{
            display: 'flex', alignItems: 'center', gap: 1.25, px: 2, py: 1.25, borderRadius: 3,
            bgcolor: tokens.color.ink, color: '#fff', boxShadow: tokens.shadow.lg, fontSize: 14, fontWeight: 500, maxWidth: 'calc(100vw - 32px)',
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
