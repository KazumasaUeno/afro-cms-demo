import { Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Stack, Typography } from '@mui/material';
import { useState } from 'react';
import type { DiagnosisReport, Project } from '@/types';
import { StatusPill } from '@/components/ui';
import { useFullScreenDialog } from '@/hooks/useMediaQueries';
import { TOUCH } from '@/theme/media';
import { tokens } from '@/theme/tokens';
import { useDemo } from '@/store/DemoStore';
import { followUpName } from '@/features/projects/followUp';

type Finding = DiagnosisReport['findings'][number];

const PRIORITY: Record<Finding['priority'], { tone: 'danger' | 'warning' | 'neutral'; label: string }> = {
  high: { tone: 'danger', label: '高' }, medium: { tone: 'warning', label: '中' }, low: { tone: 'neutral', label: '低' },
};

interface Props {
  /** 元の案件。null で閉じる */
  project: Project | null;
  /** 最新の診断の改善提案（選ぶ候補） */
  findings: Finding[];
  onClose: () => void;
  /** 採用する提案の見出し（1 件以上） */
  onStart: (proposals: string[]) => void;
}

/**
 * 追加開発として起こす改善提案を選ぶ（0.31.0。開発者画面のインサイトだけ）。
 * 1 件以上選ぶと、元の案件とつながった新しい案件をヒアリングの回答を引き継いで作る。元の案件は運用・改善のまま
 */
export function FollowUpDialog({ project, findings, onClose, onStart }: Props) {
  const fullScreen = useFullScreenDialog();
  const { state } = useDemo();
  const [picked, setPicked] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [last, setLast] = useState<Project | null>(null);
  // 開くたびに選択を空から始める。閉じるアニメーションの間は直前の案件を表示する
  const currentId = project?.id ?? null;
  if (currentId !== openId) {
    setOpenId(currentId);
    if (project) {
      setLast(project);
      setPicked([]);
    }
  }
  const shown = project ?? last;
  if (!shown) return <Dialog open={false} />;

  const toggle = (title: string) => setPicked((list) => (list.includes(title) ? list.filter((x) => x !== title) : [...list, title]));

  return (
    <Dialog open={!!project} onClose={onClose} maxWidth="sm" fullWidth fullScreen={fullScreen} aria-labelledby="follow-up-title">
      <DialogTitle id="follow-up-title">追加開発として起こす</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" component="p" sx={{ mb: 1.5 }}>
          採用する改善提案を選んでください（1件以上）。新しいプロジェクト「{followUpName(shown, state.projects)}」を作り、ヒアリングの回答を引き継ぎます。
          元のプロジェクトは運用・改善のまま続きます。小さな修正は CMS で行えます。
        </Typography>
        <Box component="ul" role="group" aria-label="採用する改善提案（複数選べます）" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {findings.map((f) => (
            <Box component="li" key={f.title} sx={{ borderTop: `1px solid ${tokens.color.border}`, '&:first-of-type': { borderTop: 'none' }, minWidth: 0 }}>
              <FormControlLabel
                control={<Checkbox checked={picked.includes(f.title)} onChange={() => toggle(f.title)} />}
                label={
                  <Box sx={{ minWidth: 0, py: 0.5 }}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.25 }}>
                      <StatusPill tone={PRIORITY[f.priority].tone}>{PRIORITY[f.priority].label}</StatusPill>
                      <Typography variant="body2" component="span" sx={{ fontWeight: 650, overflowWrap: 'anywhere' }}>{f.title}</Typography>
                    </Stack>
                    <Typography variant="caption" component="span" sx={{ display: 'block', overflowWrap: 'anywhere' }}>{f.detail}</Typography>
                  </Box>
                }
                sx={{ m: 0, py: 0.5, width: '100%', minHeight: 44, alignItems: 'flex-start', '& .MuiFormControlLabel-label': { minWidth: 0, flex: 1 }, [TOUCH]: { minHeight: 52 } }}
              />
            </Box>
          ))}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Typography variant="caption" sx={{ flex: 1 }} aria-live="polite">{picked.length ? `${picked.length}件を選択中` : '1件以上選んでください'}</Typography>
        <Button variant="outlined" onClick={onClose}>キャンセル</Button>
        {/* 並びは提案の順にそろえる */}
        <Button variant="contained" disabled={picked.length === 0} onClick={() => onStart(findings.map((f) => f.title).filter((t) => picked.includes(t)))}>
          追加開発を作成
        </Button>
      </DialogActions>
    </Dialog>
  );
}
