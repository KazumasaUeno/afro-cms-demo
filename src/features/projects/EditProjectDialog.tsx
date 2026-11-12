import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography, Box } from '@mui/material';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import type { Project } from '@/types';
import { useFullScreenDialog } from '@/hooks/useMediaQueries';
import { TOUCH } from '@/theme/media';
import { ProjectFields } from './ProjectFields';
import {
  ACCENT_PRESETS, applyProjectPatch, isoToYmd, PROJECT_FIELD_ORDER, projectPatchFromDraft, projectToDraft, todayYmd, validateProject,
  type ProjectDraft, type ProjectField,
} from './projectForm';

function Group({ title, sub, index, children }: { title: string; sub?: string; index: number; children: ReactNode }) {
  return (
    <Box component="section" sx={{ pt: index ? 1 : 0 }}>
      <Typography variant="h4" component="h3">{title}</Typography>
      {sub && <Typography variant="caption" component="p" sx={{ mt: 0.25 }}>{sub}</Typography>}
      <Stack spacing={2.25} sx={{ mt: 1.75 }}>{children}</Stack>
    </Box>
  );
}

interface Props {
  /** 編集する案件（null で閉じる） */
  project: Project | null;
  projects: Project[];
  onClose: () => void;
  /** 変わった入力だけ渡す（何も変えていなければ呼ばずに閉じる） */
  onSave: (draft: ProjectDraft) => void;
  saving?: boolean;
}

/**
 * プロジェクトの情報の編集（管理者画面・demo だけ。2026-11-12）。入力欄は新しいプロジェクトと同じ ProjectFields、
 * 入力チェックは reducer と同じ validateProject（URL の重複は自分を除く）。段階・進捗・次の作業・承認待ちの数は変えない
 */
export function EditProjectDialog({ project, projects, onClose, onSave, saving }: Props) {
  const fullScreen = useFullScreenDialog();
  const [draft, setDraft] = useState<ProjectDraft | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const refs = useRef<Partial<Record<ProjectField, HTMLElement | null>>>({});
  // 開くたびに、いまの値で入力を作り直す。閉じたときは draft を残し、閉じるアニメーションの間も内容を表示する
  const [source, setSource] = useState<Project | null>(null);
  const [base, setBase] = useState<Project | null>(null);
  if (project !== source) {
    setSource(project);
    if (project && !source) {
      setBase(project);
      setDraft(projectToDraft(project));
      setSubmitted(false);
    }
  }

  const self = base ? projects.find((p) => p.id === base.id) ?? base : null;
  const errors = useMemo(() => (draft && self ? validateProject(draft, projects, self) : {}), [draft, projects, self]);
  if (!draft || !self) return <Dialog open={false} />;

  const set = (patch: Partial<ProjectDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const show = (k: ProjectField) => (submitted ? errors[k] : undefined);
  // 候補に無いいまの色（初期データ）も選べるように残す
  const accents = ACCENT_PRESETS.some((a) => a.value === self.accent) ? ACCENT_PRESETS : [...ACCENT_PRESETS, { value: self.accent, name: 'いまの色' }];
  const today = todayYmd();
  const current = self.launchDate ? isoToYmd(self.launchDate) : '';
  const minLaunchDate = current && current < today ? current : today;

  const submit = () => {
    setSubmitted(true);
    const fresh = validateProject(draft, projects, self);
    const first = PROJECT_FIELD_ORDER.find((k) => fresh[k]);
    if (first) {
      refs.current[first]?.focus();
      return;
    }
    if (saving) return;
    if (!applyProjectPatch(self, projectPatchFromDraft(draft))) {
      onClose();
      return;
    }
    onSave(draft);
  };

  return (
    <Dialog open={!!project} onClose={onClose} maxWidth="sm" fullWidth fullScreen={fullScreen} aria-labelledby="edit-project-title">
      <DialogTitle id="edit-project-title">プロジェクトの情報を編集</DialogTitle>
      <DialogContent dividers sx={{ [TOUCH]: { '& .MuiInputBase-input': { fontSize: 16 } } }}>
        <Box component="form" id="edit-project-form" noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <Stack spacing={3}>
            <Typography variant="body2" color="text.secondary">
              段階・進捗・次に必要な作業は、制作の進み具合から決まるため、ここでは変更できません。
            </Typography>
            <ProjectFields
              draft={draft} set={set} show={show} refs={refs} Group={Group}
              accents={accents} minLaunchDate={minLaunchDate} withNextAction={false}
            />
          </Stack>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button variant="outlined" onClick={onClose}>キャンセル</Button>
        <Button type="submit" form="edit-project-form" variant="contained" disabled={saving}>保存</Button>
      </DialogActions>
    </Dialog>
  );
}
