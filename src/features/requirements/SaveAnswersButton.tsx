import { Box, Button } from '@mui/material';
import { Check, Save } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useRepositories } from '@/repositories';
import { tokens } from '@/theme/tokens';

/**
 * 回答の「保存」ボタン。入力は従来どおり自動で保存される（store が 250ms ごとにまとめて書く）。
 * ボタンはそれを待たずに、いまの状態をすぐ保存し、結果をそのまま表示する（保存できなければ失敗と出す）。
 * 「保存しました」は、保存した時点の回答と画面の回答が同じ間だけ出す（その後に入力したら消える）。
 * beforeSave: 保存の前に確定させたい値（ウィザードの競合サイト欄など）を dispatch する
 */
export function SaveAnswersButton({ beforeSave, disabled = false }: { beforeSave?: () => void; disabled?: boolean }) {
  const { requirements } = useRepositories();
  const { data: req } = requirements.useCurrent();
  const current = JSON.stringify([req.answers, req.competitors]);
  const [saved, setSaved] = useState<{ snapshot: string; ok: boolean; at: Date } | null>(null);
  const [requested, setRequested] = useState(false);
  // 押した直後の dispatch が反映された描画のあとで保存する（反映前の状態を保存しないため）
  const currentRef = useRef(current);
  currentRef.current = current;

  useEffect(() => {
    if (!requested) return;
    setRequested(false);
    const snapshot = currentRef.current;
    const at = new Date();
    void requirements.saveNow().then((ok) => setSaved({ snapshot, ok, at }));
  }, [requested, requirements, current]);

  const isSaved = !!saved && saved.snapshot === current;
  const failed = isSaved && !saved?.ok;
  const at = saved ? `${saved.at.getHours()}:${String(saved.at.getMinutes()).padStart(2, '0')}` : '';

  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
      <Button
        variant="outlined"
        startIcon={isSaved && !failed ? <Check size={16} strokeWidth={3} /> : <Save size={16} />}
        disabled={disabled}
        onClick={() => { beforeSave?.(); setRequested(true); }}
        sx={isSaved && !failed ? { color: '#08765A', borderColor: tokens.color.success, bgcolor: tokens.color.successSoft, '&:hover': { borderColor: tokens.color.success, bgcolor: tokens.color.successSoft } } : undefined}
      >
        {isSaved && !failed ? '保存済み' : '保存'}
      </Button>
      <Box component="span" role="status" aria-live="polite" sx={{ fontSize: 12.5, fontWeight: 600, color: failed ? tokens.color.danger : '#08765A', minWidth: 0 }}>
        {isSaved ? (failed ? '保存できませんでした（ブラウザの保存領域を確認してください）' : `保存しました ${at}`) : ''}
      </Box>
    </Box>
  );
}
