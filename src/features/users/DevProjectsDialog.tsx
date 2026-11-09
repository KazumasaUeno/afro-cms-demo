import { Box, Button, Checkbox, Dialog, FormControlLabel, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { useState } from 'react';
import type { Member, Project } from '@/types';
import { useFullScreenDialog } from '@/hooks/useMediaQueries';
import { TOUCH } from '@/theme/media';
import { tokens } from '@/theme/tokens';

interface Props {
  /** 担当を変えるメンバー。null で閉じる */
  member: Member | null;
  /** そのメンバーの今の担当（Project.id） */
  assigned: string[];
  /** 開発者画面の権限がオンか（オフでも担当は決められる） */
  hasAccess: boolean;
  projects: Project[];
  onClose: () => void;
  onSave: (projectIds: string[]) => void;
}

/** 開発者の担当プロジェクトを選ぶ（チェックしたプロジェクトだけを開発者画面で開ける） */
export function DevProjectsDialog({ member, assigned, hasAccess, projects, onClose, onSave }: Props) {
  const fullScreen = useFullScreenDialog();
  const [ids, setIds] = useState<string[]>([]);
  // 開くたびに今の担当から作り直す。閉じるアニメーションの間は直前のメンバーを表示する
  const [openId, setOpenId] = useState<string | null>(null);
  const [last, setLast] = useState<Member | null>(null);
  const currentId = member?.id ?? null;
  if (currentId !== openId) {
    setOpenId(currentId);
    if (member) {
      setLast(member);
      setIds(assigned);
    }
  }
  const shown = member ?? last;
  if (!shown) return <Dialog open={false} />;

  const toggle = (id: string) => setIds((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));

  return (
    <Dialog open={!!member} onClose={onClose} maxWidth="xs" fullWidth fullScreen={fullScreen} aria-labelledby="dev-projects-title">
      <DialogTitle id="dev-projects-title">{shown.name}の担当プロジェクト</DialogTitle>
      <DialogContent dividers>
        <Typography variant="caption" component="p" sx={{ mb: 1 }}>
          チェックしたプロジェクトだけが、開発者画面のプロジェクト切替に出ます。
          {!hasAccess && ' 開発者画面の権限がオフのため、権限をオンにするまで開けません。'}
        </Typography>
        <Box component="ul" role="group" aria-label="担当プロジェクト（複数選べます）" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {projects.map((p) => (
            <Box component="li" key={p.id} sx={{ borderTop: `1px solid ${tokens.color.border}`, '&:first-of-type': { borderTop: 'none' }, minWidth: 0 }}>
              <FormControlLabel
                control={<Checkbox checked={ids.includes(p.id)} onChange={() => toggle(p.id)} />}
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                    <Box sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: p.accent, flexShrink: 0 }} aria-hidden />
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" component="span" sx={{ display: 'block', fontWeight: 650, overflowWrap: 'anywhere' }}>{p.siteName}</Typography>
                      <Typography variant="caption" component="span" sx={{ display: 'block', overflowWrap: 'anywhere' }}>{p.clientName}</Typography>
                    </Box>
                  </Box>
                }
                sx={{ m: 0, py: 0.5, width: '100%', minHeight: 44, '& .MuiFormControlLabel-label': { minWidth: 0, flex: 1 }, [TOUCH]: { minHeight: 52 } }}
              />
            </Box>
          ))}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button variant="outlined" onClick={onClose}>キャンセル</Button>
        <Button variant="contained" onClick={() => onSave(ids)}>保存する</Button>
      </DialogActions>
    </Dialog>
  );
}
