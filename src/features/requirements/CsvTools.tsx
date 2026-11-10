import { Box, Button, IconButton, Stack, Typography } from '@mui/material';
import { CheckCircle2, Download, FileUp, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { REQUIREMENT_QUESTIONS } from '@/data/requirements';
import { useRepositories } from '@/repositories';
import { useToast } from '@/hooks/useToast';
import { downloadText } from '@/services/download';
import { tokens } from '@/theme/tokens';
import { MAX_CSV_BYTES, buildTemplateCsv, decodeCsv, parseCsv, planCsvImport, type CsvPlan } from './csv';

interface Result extends CsvPlan { fileName: string; applied: number }

/**
 * ヒアリングの回答の CSV（テンプレートのダウンロードと一括入力）。
 * 取り込んだ回答はアフロの入力として記録する（setAnswer by: 'afro'）。承認後は出さない（reducer も受け付けない）。
 * onApplied: 反映したあと、手元に入力途中の値を持つ欄（競合サイトの欄など）を読み直すために呼ぶ
 */
export function CsvTools({ onApplied, dense = false }: { onApplied?: () => void; dense?: boolean }) {
  const { requirements } = useRepositories();
  const { data: req } = requirements.useCurrent();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<Result | null>(null);
  const locked = req.status === 'approved';

  const download = () => {
    const date = new Date().toISOString().slice(0, 10);
    downloadText(`hearing-template-${date}.csv`, buildTemplateCsv(req), 'text/csv;charset=utf-8');
    toast('テンプレートをダウンロードしました');
  };

  const importFile = async (file: File) => {
    if (file.size > MAX_CSV_BYTES) {
      setResult({ fileName: file.name, applied: 0, apply: [], unchanged: 0, blank: 0, skipped: [], error: 'ファイルが大きすぎます（1MB まで）。' });
      return;
    }
    const buf = await new Promise<ArrayBuffer>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as ArrayBuffer);
      r.onerror = () => reject(r.error);
      r.readAsArrayBuffer(file);
    }).catch(() => null);
    if (!buf) {
      setResult({ fileName: file.name, applied: 0, apply: [], unchanged: 0, blank: 0, skipped: [], error: 'ファイルを読み込めませんでした。' });
      return;
    }
    const plan = planCsvImport(parseCsv(decodeCsv(buf)), req);
    // 承認後は reducer が受け付けないので、反映したことにしない
    const applied = !plan.error && !locked ? plan.apply.length : 0;
    if (applied) void requirements.setAnswers(req.projectId, plan.apply, 'afro');
    setResult({ ...plan, fileName: file.name, applied });
    if (applied) {
      onApplied?.();
      toast(`CSV から ${applied} 問の回答を反映しました`);
    }
  };

  if (locked) return null;
  const textOf = (id: string) => REQUIREMENT_QUESTIONS.find((q) => q.id === id)?.text;

  return (
    <Box>
      <Stack direction={dense ? 'column' : { xs: 'column', sm: 'row' }} spacing={1} alignItems={dense ? 'stretch' : { sm: 'center' }}>
        <Button variant="outlined" size="small" startIcon={<Download size={15} />} onClick={download}>テンプレートをダウンロード</Button>
        <Button variant="outlined" size="small" startIcon={<FileUp size={15} />} onClick={() => input.current?.click()}>CSVで一括入力</Button>
        <input
          ref={input}
          type="file"
          accept=".csv,text/csv"
          hidden
          aria-label="ヒアリングの回答の CSV ファイル"
          data-testid="hearing-csv-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void importFile(f);
          }}
        />
      </Stack>
      <Typography variant="caption" component="p" sx={{ mt: 0.75 }}>
        テンプレートはいまの回答が入った状態で出力します（Excel で開けます）。「回答」の列を書いて取り込むと、空欄の行は変えずに、書いた回答だけを反映します。
      </Typography>

      {result && (
        <Box
          role="status"
          sx={{
            mt: 1.5, p: 1.5, borderRadius: 2, border: `1px solid ${result.error ? tokens.color.danger : result.skipped.length ? tokens.color.warning : tokens.color.success}`,
            bgcolor: result.error ? tokens.color.dangerSoft : result.skipped.length ? tokens.color.warningSoft : tokens.color.successSoft,
          }}
        >
          <Stack direction="row" spacing={1} alignItems="flex-start">
            {!result.error && result.applied > 0 && <CheckCircle2 size={17} color={tokens.color.success} style={{ flexShrink: 0, marginTop: 2 }} />}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 650, overflowWrap: 'anywhere' }}>
                {result.error ? `取り込めませんでした（${result.fileName}）` : `${result.fileName} を取り込みました`}
              </Typography>
              {result.error ? (
                <Typography variant="caption" sx={{ display: 'block', color: tokens.color.dangerInk }}>{result.error}</Typography>
              ) : (
                <Typography variant="caption" sx={{ display: 'block', color: tokens.color.ink }}>
                  反映 <b>{result.applied}</b> 問・変更なし {result.unchanged} 問・空欄 {result.blank} 問・反映しなかった行 <b>{result.skipped.length}</b>
                </Typography>
              )}
              {result.skipped.length > 0 && (
                <Box component="ul" sx={{ m: 0, mt: 0.75, pl: 2.25 }}>
                  {result.skipped.slice(0, 20).map((s) => (
                    <Typography component="li" variant="caption" key={`${s.line}-${s.questionId}`} sx={{ display: 'list-item', color: tokens.color.ink, overflowWrap: 'anywhere' }}>
                      {s.line} 行目（{textOf(s.questionId) ?? s.questionId}）: {s.reason}
                    </Typography>
                  ))}
                  {result.skipped.length > 20 && <Typography component="li" variant="caption" sx={{ display: 'list-item' }}>ほか {result.skipped.length - 20} 行</Typography>}
                </Box>
              )}
            </Box>
            <IconButton size="small" aria-label="取り込みの結果を閉じる" onClick={() => setResult(null)} sx={{ mt: -0.5, mr: -0.5 }}><X size={16} /></IconButton>
          </Stack>
        </Box>
      )}
    </Box>
  );
}
