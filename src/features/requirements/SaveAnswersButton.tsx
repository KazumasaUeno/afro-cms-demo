import { Box, Button } from '@mui/material';
import { Save } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useCurrentRequirements, useRepositories } from '@/repositories';
import { tokens } from '@/theme/tokens';

/**
 * 回答の保存状態と「保存」ボタン（2026-11-10 合意: 保存ボタン＋緑丸）。
 * 入力は自動で保存される（store が 250ms ごとにまとめて書く）。この部品は回答が変わるたびに「保存中…」を出し、
 * 入力が落ち着いたら saveNow で保存して、その結果（「● 保存済み HH:MM」/ 失敗）を常に表示する。
 * 「保存」ボタンは待たずにすぐ保存する。表示する時刻は、この画面で保存を確かめた時刻（開いた直後は lastAnsweredAt）。
 * beforeSave: 保存の前に確定させたい値を dispatch する
 */
const SETTLE_MS = 400;

type Phase = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved'; at: Date } | { kind: 'failed' };

const hhmm = (d: Date) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
/** 今日なら HH:MM、別の日なら M/D HH:MM（前日の時刻を今日の時刻に見せない） */
const stamp = (d: Date) => {
  const now = new Date();
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  return sameDay ? hhmm(d) : `${d.getMonth() + 1}/${d.getDate()} ${hhmm(d)}`;
};

/**
 * 画面を開いた時点（idle）の表示に使う時刻: 回答の記録（answerMeta.at）のうち最も新しいもの。
 * answerMeta.at は reducer が回答を書き換えたときに付け、store がそのまま localStorage へ書くため、
 * 「保存されている回答が最後に入力された時刻」として正しい。回答を空にすると記録も消えるので、
 * その場合は残っている回答の最新時刻になる（保存した時刻より古く出ることはあっても、新しく出ることは無い）。
 */
function lastAnsweredAt(meta: Record<string, { at: string }> | undefined): Date | null {
  let latest: number | null = null;
  for (const m of Object.values(meta ?? {})) {
    const t = Date.parse(m.at);
    if (!Number.isNaN(t) && (latest === null || t > latest)) latest = t;
  }
  return latest === null ? null : new Date(latest);
}

export function SaveAnswersButton({ beforeSave, disabled = false, compact = false }: { beforeSave?: () => void; disabled?: boolean; compact?: boolean }) {
  const { requirements } = useRepositories();
  const { data: req } = useCurrentRequirements();
  const current = JSON.stringify([req.answers, req.competitors]);
  // 画面を開いた時点の回答は保存済み（localStorage から読んだもの）
  const savedSnapshot = useRef(current);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [requested, setRequested] = useState(false);
  const currentRef = useRef(current);
  currentRef.current = current;
  // 「保存中…」に入る前の表示（入力を戻して保存が要らなくなったときに戻す）
  const settledRef = useRef<Phase>(phase);
  if (phase.kind !== 'saving') settledRef.current = phase;
  // 画面を離れたあとに保存の結果が返っても setPhase しない
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // save は currentRef を読むので、effect の依存に入れなくてよい
  const save = () => {
    const snapshot = currentRef.current;
    void requirements.saveNow().catch(() => false).then((ok) => {
      if (!mounted.current) return;
      // 保存を待つ間にさらに入力されていたら、次の保存を待つ（表示は「保存中…」のまま）
      if (snapshot !== currentRef.current) return;
      savedSnapshot.current = snapshot;
      setPhase(ok ? { kind: 'saved', at: new Date() } : { kind: 'failed' });
    });
  };

  // 回答が変わったら「保存中…」。入力が落ち着いたら保存して結果を出す
  useEffect(() => {
    if (current === savedSnapshot.current) {
      // 入力を待つ間に元の値へ戻した: 保存は要らない。「保存中…」のままにせず前の表示へ戻す
      setPhase((p) => (p.kind === 'saving' ? settledRef.current : p));
      return;
    }
    setPhase({ kind: 'saving' });
    const t = window.setTimeout(save, SETTLE_MS);
    return () => window.clearTimeout(t);
  }, [current]);

  // 「保存」: 押した直後の dispatch（beforeSave）が反映された描画のあとで保存する
  useEffect(() => {
    if (!requested) return;
    setRequested(false);
    setPhase({ kind: 'saving' });
    save();
  }, [requested, current]);

  const idleAt = phase.kind === 'idle' ? lastAnsweredAt(req.answerMeta) : null;
  // 回答が 1 つも無い（記録も無い）ときは「保存済み」と言わない
  const empty = phase.kind === 'idle' && !idleAt;
  const label =
    phase.kind === 'saving' ? '保存中…'
      : phase.kind === 'failed' ? '保存できませんでした（ブラウザの保存領域を確認してください）'
        : phase.kind === 'saved' ? `保存済み ${stamp(phase.at)}`
          : idleAt ? `保存済み ${stamp(idleAt)}`
            : '未入力';
  const dotColor = phase.kind === 'saving' || empty ? tokens.color.borderStrong : phase.kind === 'failed' ? tokens.color.danger : tokens.color.success;

  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: compact ? 0.75 : 1.25, minWidth: 0 }}>
      <Box
        component="span"
        role="status"
        aria-live="polite"
        sx={{
          display: 'inline-flex', alignItems: 'center', gap: 0.75, minWidth: 0, fontSize: 12.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
          color: phase.kind === 'failed' ? tokens.color.danger : phase.kind === 'saving' || empty ? tokens.color.muted : tokens.color.successInk,
        }}
      >
        <Box component="span" aria-hidden sx={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, bgcolor: dotColor }} />
        <Box component="span" sx={{ whiteSpace: phase.kind === 'failed' ? 'normal' : 'nowrap' }}>{label}</Box>
      </Box>
      <Button
        variant="outlined"
        size={compact ? 'small' : 'medium'}
        startIcon={<Save size={16} />}
        disabled={disabled}
        onClick={() => { beforeSave?.(); setRequested(true); }}
        sx={{ flexShrink: 0 }}
      >
        保存
      </Button>
    </Box>
  );
}
