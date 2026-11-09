import { useState } from 'react';
import type { Project } from '@/types';
import { devAccessState, devProjectsState, useDemo } from '@/store/DemoStore';
import { MEMBERS } from '@/data/members';
import { allDevPeople } from '@/data/people';
import { projectChanged, projectDraftOf, validateProject, type ProjectDraft } from '@/data/projects';
import { useToast } from '@/hooks/useToast';
import { ProjectDialog } from './ProjectDialog';

/**
 * プロジェクトの登録・編集ダイアログ（一覧の「プロジェクトを登録」と詳細の「編集」で共有する）。
 * openNew / openEdit で開き、dialog を画面に置く
 */
export function useProjectEditor() {
  const { state, dispatch } = useDemo();
  const toast = useToast();
  const [draft, setDraft] = useState<ProjectDraft | null>(null);
  const allPeople = allDevPeople(state);
  const people = allPeople.filter((m) => !m.disabled);

  const openNew = () => setDraft({ siteName: '', clientName: '', industry: '', siteUrl: '', ownerId: 'm1', launchDate: '', devIds: [] });
  const openEdit = (p: Project) => setDraft(projectDraftOf(p, allPeople, devProjectsState(state)));

  const save = (d: ProjectDraft) => {
    // reducer と同じ判定（validateProject / projectChanged）で、実際に保存される（変わる）ときだけ知らせる
    const valid = Object.keys(validateProject(d, state.projects, MEMBERS.map((m) => m.id))).length === 0;
    const prev = d.id ? state.projects.find((p) => p.id === d.id) : undefined;
    const change = prev ? projectChanged(projectDraftOf(prev, allPeople, devProjectsState(state)), d) : null;
    dispatch({ type: 'saveProject', project: d });
    setDraft(null);
    if (!valid) return;
    if (!d.id) toast(`プロジェクト「${d.siteName.trim()}」を登録しました`);
    else if (change && (change.fields || change.devs)) toast('登録内容を保存しました');
  };

  const dialog = (
    <ProjectDialog draft={draft} projects={state.projects} people={people} access={devAccessState(state)} onClose={() => setDraft(null)} onSave={save} />
  );
  return { openNew, openEdit, dialog };
}
