import { Box, Divider, IconButton, Stack, Tooltip } from '@mui/material';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { Placeholder } from '@tiptap/extension-placeholder';
import { Bold, Heading2, Heading3, ImagePlus, Italic, List, ListOrdered, Quote, Redo2, Undo2, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { tokens } from '@/theme/tokens';
import { ImagePickerDialog } from './ImagePickerDialog';
import { sanitizeHtml } from './sanitize';

interface Props {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

function ToolButton({ icon: Icon, label, active, disabled, onClick, shortcut }: { icon: LucideIcon; label: string; active?: boolean; disabled?: boolean; onClick: () => void; shortcut?: string }) {
  return (
    <Tooltip title={shortcut ? `${label}（${shortcut}）` : label}>
      <span>
        <IconButton
          size="small"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          aria-pressed={active}
          sx={{
            width: 34, height: 34, borderRadius: '9px',
            color: active ? tokens.color.primary : tokens.color.inkSoft,
            bgcolor: active ? tokens.color.primarySoft : 'transparent',
            '&:hover': { bgcolor: active ? tokens.color.primarySoft : tokens.color.bgSubtle },
          }}
        >
          <Icon size={17} strokeWidth={2} />
        </IconButton>
      </span>
    </Tooltip>
  );
}

function Toolbar({ editor, onImage }: { editor: Editor; onImage: () => void }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      quote: e.isActive('blockquote'),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const chain = () => editor.chain().focus();
  return (
    <Stack
      direction="row"
      role="toolbar"
      aria-label="書式"
      sx={{
        // 外枠は overflow: clip（hidden だとスクロールコンテナになり sticky が効かない）。上部バーの下に貼り付く
        position: 'sticky', top: tokens.layout.topbar, zIndex: 2, alignItems: 'center', gap: 0.25, p: 0.75, flexWrap: 'wrap',
        bgcolor: `color-mix(in srgb, ${tokens.color.surface} 92%, transparent)`, backdropFilter: 'blur(8px)', borderBottom: `1px solid ${tokens.color.border}`,
      }}
    >
      <ToolButton icon={Heading2} label="見出し（大）" active={s.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()} />
      <ToolButton icon={Heading3} label="見出し（小）" active={s.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()} />
      <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 0.75 }} />
      <ToolButton icon={Bold} label="太字" shortcut="Ctrl+B" active={s.bold} onClick={() => chain().toggleBold().run()} />
      <ToolButton icon={Italic} label="斜体" shortcut="Ctrl+I" active={s.italic} onClick={() => chain().toggleItalic().run()} />
      <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 0.75 }} />
      <ToolButton icon={List} label="箇条書き" active={s.bullet} onClick={() => chain().toggleBulletList().run()} />
      <ToolButton icon={ListOrdered} label="番号付きリスト" active={s.ordered} onClick={() => chain().toggleOrderedList().run()} />
      <ToolButton icon={Quote} label="引用" active={s.quote} onClick={() => chain().toggleBlockquote().run()} />
      <ToolButton icon={ImagePlus} label="画像を挿入" onClick={onImage} />
      <Box sx={{ flex: 1 }} />
      <ToolButton icon={Undo2} label="元に戻す" shortcut="Ctrl+Z" disabled={!s.canUndo} onClick={() => chain().undo().run()} />
      <ToolButton icon={Redo2} label="やり直す" shortcut="Ctrl+Shift+Z" disabled={!s.canRedo} onClick={() => chain().redo().run()} />
    </Stack>
  );
}

/** Tiptap による本文編集。ページ切替時は key を変えて作り直す前提 */
export function RichEditor({ content, onChange, placeholder = '本文を入力…  「/」ではなく上のツールバーから見出しや画像を追加できます' }: Props) {
  const [picker, setPicker] = useState(false);
  // onUpdate は初回の関数を掴むため、最新の onChange は ref 経由で呼ぶ
  const changeRef = useRef(onChange);
  useEffect(() => {
    changeRef.current = onChange;
  }, [onChange]);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, link: false, underline: false, code: false, codeBlock: false, horizontalRule: false, strike: false }),
      Image.configure({ allowBase64: true }),
      Placeholder.configure({ placeholder }),
    ],
    content: sanitizeHtml(content),
    immediatelyRender: true,
    editorProps: { attributes: { 'aria-label': '本文', role: 'textbox', 'aria-multiline': 'true', class: 'afro-prose' } },
    onUpdate: ({ editor: e }) => changeRef.current(e.getHTML()),
  });

  if (!editor) return null;
  return (
    <Box
      sx={{
        borderRadius: '16px', border: `1px solid ${tokens.color.border}`, bgcolor: tokens.color.surface, overflow: 'clip',
        '&:focus-within': { borderColor: tokens.color.primary, boxShadow: tokens.shadow.focus },
        transition: 'border-color .16s, box-shadow .16s',
      }}
    >
      <Toolbar editor={editor} onImage={() => setPicker(true)} />
      <Box
        sx={{
          px: { xs: 2, md: 3.5 }, py: { xs: 2, md: 3 }, minHeight: { xs: 240, md: 320 },
          '& .ProseMirror': { outline: 'none', minHeight: { xs: 200, md: 280 }, fontSize: 16, lineHeight: 1.85, color: tokens.color.ink },
          '& .ProseMirror:focus-visible': { boxShadow: 'none' },
          '& .ProseMirror > * + *': { mt: 1.5 },
          '& .ProseMirror h2': { fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.35, mt: 3 },
          '& .ProseMirror h3': { fontSize: 19, fontWeight: 680, lineHeight: 1.4, mt: 2.5 },
          '& .ProseMirror ul, & .ProseMirror ol': { pl: 3 },
          '& .ProseMirror blockquote': { borderLeft: `3px solid ${tokens.color.accent}`, pl: 2, color: tokens.color.inkSoft, ml: 0 },
          '& .ProseMirror img': { display: 'block', maxWidth: '100%', borderRadius: '14px', my: 2 },
          '& .ProseMirror img.ProseMirror-selectednode': { outline: `3px solid ${tokens.color.primary}`, outlineOffset: 2 },
          '& .ProseMirror p.is-editor-empty:first-of-type::before': {
            content: 'attr(data-placeholder)', color: tokens.color.faint, float: 'left', height: 0, pointerEvents: 'none',
          },
        }}
      >
        <EditorContent editor={editor} />
      </Box>
      <ImagePickerDialog
        open={picker}
        onClose={() => setPicker(false)}
        onPick={(img) => {
          editor.chain().focus().setImage({ src: img.src, alt: img.label }).run();
          setPicker(false);
        }}
      />
    </Box>
  );
}
