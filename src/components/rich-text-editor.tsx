"use client";

import { useState, useCallback, useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Link as LinkIcon,
  Undo,
  Redo,
} from "lucide-react";
import { cn } from "@/lib/utils";

type EditorMode = "visual" | "html";

type MergeField = {
  key: string;
  label: string;
};

type RichTextEditorProps = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  mergeFields?: MergeField[];
  className?: string;
};

function ToolbarButton({
  onClick,
  active,
  disabled,
  children,
  title,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-md transition-colors",
        active
          ? "bg-zinc-900 text-white"
          : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
        disabled && "cursor-not-allowed opacity-40",
      )}
    >
      {children}
    </button>
  );
}

function EditorToolbar({
  editor,
  mode,
  onModeChange,
  mergeFields,
  onInsertMergeField,
}: {
  editor: ReturnType<typeof useEditor>;
  mode: EditorMode;
  onModeChange: (mode: EditorMode) => void;
  mergeFields?: MergeField[];
  onInsertMergeField?: (field: string) => void;
}) {
  const isVisual = mode === "visual";

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1 border-b border-zinc-200 bg-zinc-50 px-2 py-1.5">
      {/* Mode toggle */}
      <div className="mr-2 flex rounded-md border border-zinc-200 bg-white p-0.5">
        <button
          type="button"
          onClick={() => onModeChange("visual")}
          className={cn(
            "rounded px-2.5 py-1 text-xs font-medium transition-colors",
            mode === "visual"
              ? "bg-zinc-900 text-white"
              : "text-zinc-600 hover:text-zinc-900",
          )}
        >
          Visual
        </button>
        <button
          type="button"
          onClick={() => onModeChange("html")}
          className={cn(
            "rounded px-2.5 py-1 text-xs font-medium transition-colors",
            mode === "html"
              ? "bg-zinc-900 text-white"
              : "text-zinc-600 hover:text-zinc-900",
          )}
        >
          HTML
        </button>
      </div>

      {/* Divider */}
      <div className="mx-1 h-6 w-px bg-zinc-200" />

      {/* Formatting buttons - only enabled in visual mode */}
      <ToolbarButton
        onClick={() => editor?.chain().focus().toggleBold().run()}
        active={editor?.isActive("bold")}
        disabled={!isVisual}
        title="Bold"
      >
        <Bold className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor?.chain().focus().toggleItalic().run()}
        active={editor?.isActive("italic")}
        disabled={!isVisual}
        title="Italic"
      >
        <Italic className="h-4 w-4" />
      </ToolbarButton>

      <div className="mx-1 h-6 w-px bg-zinc-200" />

      <ToolbarButton
        onClick={() => editor?.chain().focus().toggleBulletList().run()}
        active={editor?.isActive("bulletList")}
        disabled={!isVisual}
        title="Bullet list"
      >
        <List className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        active={editor?.isActive("orderedList")}
        disabled={!isVisual}
        title="Numbered list"
      >
        <ListOrdered className="h-4 w-4" />
      </ToolbarButton>

      <div className="mx-1 h-6 w-px bg-zinc-200" />

      <ToolbarButton
        onClick={() => {
          const url = window.prompt("Enter URL:");
          if (url) {
            editor?.chain().focus().setLink({ href: url }).run();
          }
        }}
        active={editor?.isActive("link")}
        disabled={!isVisual}
        title="Add link"
      >
        <LinkIcon className="h-4 w-4" />
      </ToolbarButton>

      <div className="mx-1 h-6 w-px bg-zinc-200" />

      <ToolbarButton
        onClick={() => editor?.chain().focus().undo().run()}
        disabled={!isVisual || !editor?.can().undo()}
        title="Undo"
      >
        <Undo className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor?.chain().focus().redo().run()}
        disabled={!isVisual || !editor?.can().redo()}
        title="Redo"
      >
        <Redo className="h-4 w-4" />
      </ToolbarButton>

      {/* Merge fields */}
      {mergeFields && mergeFields.length > 0 && (
        <>
          <div className="basis-full border-t border-zinc-200" />
          <div className="flex min-w-0 basis-full flex-wrap items-center gap-1 py-1">
            <span className="mr-1 shrink-0 text-xs text-zinc-500">Insert:</span>
            {mergeFields.map((field) => (
              <button
                key={field.key}
                type="button"
                onClick={() => onInsertMergeField?.(field.key)}
                className="whitespace-nowrap rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-[11px] font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
                title={`Insert ${field.label}`}
              >
                {field.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Start typing...",
  mergeFields,
  className,
}: RichTextEditorProps) {
  const [mode, setMode] = useState<EditorMode>("visual");
  const [htmlValue, setHtmlValue] = useState(value);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder }),
      Link.configure({ openOnClick: false }),
    ],
    content: value,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      setHtmlValue(html);
      onChange(html);
    },
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none focus:outline-none min-h-[280px] px-4 py-3",
      },
    },
  });

  // Parent-driven updates (e.g. Letter AI assist "Apply rewrite") must replace
  // TipTap's document — `useEditor({ content })` only uses `value` on mount.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const currentHtml = editor.getHTML();
    if (htmlMeansSameBody(currentHtml, value)) return;
    editor.commands.setContent(value, { emitUpdate: false });
    queueMicrotask(() => setHtmlValue(value));
  }, [editor, value]);

  const handleModeChange = useCallback(
    (newMode: EditorMode) => {
      if (newMode === mode) return;

      if (newMode === "visual" && editor) {
        editor.commands.setContent(htmlValue);
      } else if (newMode === "html" && editor) {
        setHtmlValue(editor.getHTML());
      }

      setMode(newMode);
    },
    [mode, editor, htmlValue],
  );

  const handleHtmlChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newHtml = e.target.value;
      setHtmlValue(newHtml);
      onChange(newHtml);
    },
    [onChange],
  );

  const insertMergeField = useCallback(
    (field: string) => {
      const mergeTag = `{{${field}}}`;

      if (mode === "visual" && editor) {
        editor.chain().focus().insertContent(mergeTag).run();
      } else {
        const textarea = document.querySelector(
          "[data-html-textarea]",
        ) as HTMLTextAreaElement;
        if (textarea) {
          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;
          const newValue =
            htmlValue.slice(0, start) + mergeTag + htmlValue.slice(end);
          setHtmlValue(newValue);
          onChange(newValue);
          requestAnimationFrame(() => {
            textarea.focus();
            textarea.setSelectionRange(
              start + mergeTag.length,
              start + mergeTag.length,
            );
          });
        }
      }
    },
    [mode, editor, htmlValue, onChange],
  );

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-zinc-300 bg-white",
        className,
      )}
    >
      {editor ? (
        <EditorToolbar
          editor={editor}
          mode={mode}
          onModeChange={handleModeChange}
          mergeFields={mergeFields}
          onInsertMergeField={insertMergeField}
        />
      ) : null}

      {mode === "visual" ? (
        <EditorContent editor={editor} />
      ) : (
        <textarea
          data-html-textarea
          value={htmlValue}
          onChange={handleHtmlChange}
          className="min-h-[280px] w-full resize-none border-0 bg-white px-4 py-3 font-mono text-sm focus:outline-none focus:ring-0"
          spellCheck={false}
        />
      )}
    </div>
  );
}

/** Avoid sync loops: TipTap often serialises an empty body as `<p></p>`. */
function htmlMeansSameBody(a: string, b: string): boolean {
  if (a === b) return true;
  return normalizeEmptyBodyHtml(a) === normalizeEmptyBodyHtml(b);
}

function normalizeEmptyBodyHtml(html: string): string {
  const t = html.trim();
  if (
    t === "" ||
    /^<p>\s*<\/p>$/i.test(t) ||
    /^<p>\s*<br\s*\/?>\s*<\/p>$/i.test(t)
  ) {
    return "";
  }
  return t;
}
