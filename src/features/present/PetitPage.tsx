import { Box, Button, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import { ArrowLeft, FolderOpen, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogoMark } from '@/components/layout/Logo';
import { MEMBERS } from '@/data/members';
import { AnalysisSequence } from '@/features/requirements/AnalysisSequence';
import { hostnameOf } from '@/features/requirements/buildProposal';
import { useRepositories } from '@/repositories';
import { useToast } from '@/hooks/useToast';
import { useWrite } from '@/hooks/useWrite';
import { useForceLightMode } from '@/theme/ThemeMode';
import { tokens } from '@/theme/tokens';
import { LANDSCAPE_PHONE } from '@/theme/media';
import { PetitForm } from './petit/PetitForm';
import { PetitResult } from './petit/PetitResult';
import { RegisterDialog } from './petit/RegisterDialog';
import { emptyPetitInput, petitAnswerEntries, petitDraft, registerBlocker, type PetitInput } from './petit/petitPlan';

const c = tokens.color;
type Step = 'input' | 'analyzing' | 'result';
const STEP_LABEL: Record<Step, string> = { input: '1. ヒアリング', analyzing: '2. AI分析', result: '3. 要件・サイトマップ・デザイン' };

/**
 * 営業プレゼンモードの「プチ要件定義」（0.32.0）。見込み客の話をその場で入力し、要件のまとめ・トップ＋第1階層のサイトマップ・デザイン案を見せる。
 * 入力はこの画面の中だけに持つ（保存しない）。「案件として登録」を押したときだけプロジェクトを作り、回答をヒアリングに入れる
 */
export default function PetitPage() {
  useForceLightMode();
  const navigate = useNavigate();
  const toast = useToast();
  const write = useWrite();
  const { projects: projectRepo, requirements: reqRepo } = useRepositories();
  const { data: projects } = projectRepo.useList();
  const currentProjectId = projectRepo.useCurrentId();
  const [input, setInput] = useState<PetitInput>(emptyPetitInput);
  const [step, setStep] = useState<Step>('input');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  /** プロジェクトは作れたが、回答をヒアリングへ入れられなかった */
  const [answersFailed, setAnswersFailed] = useState(false);
  /** 作成を送った時点のプロジェクト id（二重に作らない印も兼ねる） */
  const before = useRef<Set<string> | null>(null);
  const answersRef = useRef(petitAnswerEntries(input));
  const ownerId = MEMBERS[0].id;
  const mainRef = useRef<HTMLElement>(null);
  // 段階が変わったら先頭から見せる（入力の下の方で分析を押しても、結果の先頭が見える）
  useEffect(() => { mainRef.current?.scrollTo({ top: 0 }); }, [step]);

  const blocker = useMemo(() => (createdId ? null : registerBlocker(input, projects, ownerId)), [createdId, input, projects, ownerId]);
  const back = useCallback(() => navigate('/present'), [navigate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || confirmOpen || document.fullscreenElement) return;
      // 入力の途中は Esc で黙って捨てない（戻るボタンでは戻れる）
      if (step === 'input' && JSON.stringify(input) !== JSON.stringify(emptyPetitInput())) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [back, confirmOpen, step, input]);

  /** 回答をヒアリングへ入れる。失敗したらエラーを出し（useWrite）、やり直せるようにする */
  const writeAnswers = useCallback((id: string) => {
    setAnswersFailed(false);
    void write(reqRepo.setAnswers(id, answersRef.current, 'afro')).then((ok) => {
      if (ok) toast('案件として登録しました（ヒアリングの段階）');
      else setAnswersFailed(true);
    });
  }, [reqRepo, toast, write]);

  // 作成が反映されたら（作業中が新しいプロジェクトに変わったら）、その案件のヒアリングへ回答を入れる
  useEffect(() => {
    if (!before.current || before.current.has(currentProjectId)) return;
    if (!projects.some((p) => p.id === currentProjectId)) return;
    before.current = null;
    const id = currentProjectId;
    setSaving(false);
    setConfirmOpen(false);
    setCreatedId(id);
    writeAnswers(id);
  }, [currentProjectId, projects, writeAnswers]);

  const confirm = () => {
    // 押している間・作成の反映待ちの間は送らない（ダブルクリックで 2 件作らない）
    if (saving || before.current || createdId) return;
    if (registerBlocker(input, projects, ownerId)) return;
    answersRef.current = petitAnswerEntries(input);
    before.current = new Set(projects.map((p) => p.id));
    setSaving(true);
    void write(projectRepo.create(petitDraft(input, ownerId))).then((ok) => {
      // 押せる状態へ戻す（ダイアログを閉じられるように）。二重の作成は before が止める
      setSaving(false);
      if (!ok) {
        before.current = null;
        return;
      }
      // 送れたのに新しいプロジェクトが現れない（入力チェックで作られなかった）ときは、待つのをやめて知らせる
      window.setTimeout(() => {
        if (!before.current) return;
        before.current = null;
        toast('案件を登録できませんでした。入力を確かめてもう一度お試しください', 'error');
      }, 1000);
    });
  };

  const edit = (v: PetitInput) => {
    setInput(v);
    // 登録したあとに入力を直したら、別の見込み客として登録できるようにする
    if (createdId) setCreatedId(null);
  };

  return (
    <Box sx={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', bgcolor: c.bg, backgroundImage: `radial-gradient(60% 50% at 100% 0%, ${c.accentSoft} 0%, transparent 70%), radial-gradient(50% 50% at 0% 100%, ${c.primarySoft} 0%, transparent 70%)` }}>
      <Stack component="header" direction="row" alignItems="center" spacing={1.5} sx={{ px: { xs: 2, md: 4 }, height: 64, flexShrink: 0, [LANDSCAPE_PHONE]: { height: 52 } }}>
        <LogoMark size={28} />
        <Typography sx={{ fontWeight: 700, fontSize: 14 }} noWrap>プチ要件定義</Typography>
        <Typography variant="caption" sx={{ display: { xs: 'none', sm: 'block' } }} noWrap>{STEP_LABEL[step]}</Typography>
        <Box sx={{ flex: 1 }} />
        <Button startIcon={<ArrowLeft size={16} />} onClick={back} sx={{ display: { xs: 'none', sm: 'inline-flex' } }}>プレゼンに戻る</Button>
        <Tooltip title="プレゼンに戻る（Esc）">
          <IconButton onClick={back} aria-label="プレゼンに戻る"><X size={20} /></IconButton>
        </Tooltip>
      </Stack>

      <Box component="main" ref={mainRef} aria-label={`プチ要件定義：${STEP_LABEL[step]}`} sx={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', px: { xs: 2, md: 6 }, py: { xs: 2, md: 3 } }}>
        {step === 'input' && (
          <>
            <Box sx={{ maxWidth: 1120, mx: 'auto', mb: 2.5 }}>
              <Typography variant="overline" sx={{ color: c.primary, fontSize: 12 }}>その場でつくる</Typography>
              <Typography component="h1" sx={{ fontSize: { xs: 24, md: 32 }, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.25 }}>伺ったお話から、要件とデザインを数秒で</Typography>
            </Box>
            <PetitForm value={input} onChange={edit} onSubmit={() => setStep('analyzing')} />
          </>
        )}
        {step === 'analyzing' && (
          <Box sx={{ maxWidth: 880, mx: 'auto' }}>
            <AnalysisSequence hostname={input.siteUrl.trim() ? hostnameOf(input.siteUrl.trim()) : input.clientName.trim()} onDone={() => setStep('result')} />
          </Box>
        )}
        {step === 'result' && (
          <>
            {createdId && answersFailed && (
              <Box role="alert" sx={{ maxWidth: 1120, mx: 'auto', mb: 2, p: 2, borderRadius: 3, bgcolor: c.warningSoft, color: c.warningInk, display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center' }}>
                <Typography sx={{ fontWeight: 700, flex: 1, minWidth: 200 }}>プロジェクトは作成しましたが、回答をヒアリングに入れられませんでした。</Typography>
                <Button variant="contained" onClick={() => writeAnswers(createdId)}>もう一度入れる</Button>
                <Button variant="outlined" startIcon={<FolderOpen size={16} />} onClick={() => navigate(`/projects/${createdId}`)}>プロジェクトを開く</Button>
              </Box>
            )}
            {createdId && !answersFailed && (
              <Box role="status" sx={{ maxWidth: 1120, mx: 'auto', mb: 2, p: 2, borderRadius: 3, bgcolor: c.successSoft, color: c.successInk, border: `1px solid ${c.successLine}`, display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center' }}>
                <Typography sx={{ fontWeight: 700, flex: 1, minWidth: 200 }}>案件として登録しました。回答はヒアリングに入っています。</Typography>
                <Button variant="contained" color="success" startIcon={<FolderOpen size={16} />} onClick={() => navigate(`/projects/${createdId}`)}>プロジェクトを開く</Button>
              </Box>
            )}
            <PetitResult input={input} onEdit={() => setStep('input')} onRegister={() => setConfirmOpen(true)} registerBlocker={createdId ? '登録済みです' : blocker} />
          </>
        )}
      </Box>

      <RegisterDialog
        open={confirmOpen} draft={petitDraft(input, ownerId)} answerCount={petitAnswerEntries(input).length}
        ownerName={MEMBERS[0].name} saving={saving} onClose={() => setConfirmOpen(false)} onConfirm={confirm}
      />
    </Box>
  );
}
