import { Box, Button, Stack, Typography } from '@mui/material';
import { FolderLock } from 'lucide-react';
import type { ReactNode } from 'react';
import { Surface } from '@/components/ui';
import { CLIENT_PROJECT_ID } from '@/components/layout/nav';
import { currentProject, useDemo } from '@/store/DemoStore';
import { TOUCH } from '@/theme/media';
import { tokens } from '@/theme/tokens';
import { useDevProjects } from './useDevUser';

/**
 * 開発者画面: ログイン中のメンバーが、表示中のプロジェクトの担当かを確かめてから中身を出す。
 * 担当外・担当なし・（担当だが）デモにデータが無い案件は、理由と行き先だけを出す（転送はしない）。
 * デモのため見た目の制御だけで、セキュリティ境界ではない。
 */
export function DevProjectGate({ children }: { children: ReactNode }) {
  const { state, dispatch } = useDemo();
  const project = currentProject(state);
  const mine = useDevProjects();
  const assigned = mine.some((p) => p.id === project.id);
  if (assigned && project.id === CLIENT_PROJECT_ID) return <>{children}</>;

  const title = !mine.length
    ? '担当プロジェクトがありません'
    : !assigned
      ? 'このプロジェクトの担当ではありません'
      : 'このプロジェクトの開発データはデモに含まれていません';
  const body = !mine.length
    ? '開発者画面は、担当のプロジェクトだけを開けます。管理者に担当の追加を依頼してください（管理者画面の「ユーザー管理」で設定します）。'
    : !assigned
      ? `表示中のプロジェクト「${project.siteName}」はあなたの担当ではありません。担当のプロジェクトを開くか、必要なら管理者に担当の追加を依頼してください。`
      : 'デモの開発データは MINAMO COFFEE の 1 案件分だけです。ほかの担当プロジェクトでは中身を表示しません。';
  // 開ける候補（表示中の案件以外）。デモのデータがある MINAMO COFFEE を先頭にする
  const choices = mine.filter((p) => p.id !== project.id).sort((a, b) => Number(b.id === CLIENT_PROJECT_ID) - Number(a.id === CLIENT_PROJECT_ID));

  return (
    <Surface sx={{ textAlign: 'center', py: { xs: 5, md: 7 }, px: { xs: 2.5, md: 4 }, maxWidth: 600, mx: 'auto' }}>
      <Stack alignItems="center" spacing={1.5}>
        <FolderLock size={36} color={tokens.color.faint} aria-hidden />
        <Typography variant="h3" component="h1" sx={{ overflowWrap: 'anywhere' }}>{title}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{body}</Typography>
        {mine.length > 0 && (
          <Box sx={{ width: '100%', pt: 1 }}>
            <Typography variant="caption" component="h2" sx={{ display: 'block', fontWeight: 650, color: tokens.color.muted, mb: 1 }}>
              あなたの担当プロジェクト（{mine.length}件）
            </Typography>
            <Stack component="ul" aria-label="あなたの担当プロジェクト" spacing={1} sx={{ listStyle: 'none', m: 0, p: 0, alignItems: 'center' }}>
              {mine.map((p) => (
                <Box component="li" key={p.id} sx={{ width: '100%', maxWidth: 360 }}>
                  {choices.includes(p) ? (
                    <Button
                      fullWidth variant="outlined" onClick={() => dispatch({ type: 'setCurrentProject', id: p.id })}
                      aria-label={`${p.siteName}を開く`}
                      sx={{ justifyContent: 'flex-start', gap: 1, minHeight: 40, [TOUCH]: { minHeight: 44 } }}
                    >
                      <Box sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: p.accent, flexShrink: 0 }} aria-hidden />
                      <Box component="span" sx={{ flex: 1, textAlign: 'left', minWidth: 0, overflowWrap: 'anywhere' }}>{p.siteName}</Box>
                      <Box component="span" sx={{ fontSize: 12, color: tokens.color.muted, flexShrink: 0 }}>開く</Box>
                    </Button>
                  ) : (
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 2, minHeight: 44, borderRadius: `${tokens.radius.sm}px`, bgcolor: tokens.color.surfaceMuted }}>
                      <Box sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: p.accent, flexShrink: 0 }} aria-hidden />
                      <Typography variant="body2" sx={{ flex: 1, fontWeight: 600, textAlign: 'left', overflowWrap: 'anywhere' }}>{p.siteName}</Typography>
                      <Typography variant="caption">表示中</Typography>
                    </Stack>
                  )}
                </Box>
              ))}
            </Stack>
          </Box>
        )}
      </Stack>
    </Surface>
  );
}
