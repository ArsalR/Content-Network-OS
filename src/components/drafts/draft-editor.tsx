"use client";

import { useState, useCallback, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { updateDraft } from "@/actions/drafts";
import { toast } from "sonner";
import { EditorSidebar } from "./editor-sidebar";
import { cn } from "@/lib/utils";

type DraftStatus =
  | "generating"
  | "draft"
  | "review"
  | "approved"
  | "scheduled"
  | "publishing"
  | "published"
  | "failed";

interface Site {
  id: string;
  name: string;
}

interface DraftEditorProps {
  draftId: string;
  initialTitle: string;
  initialSlug: string;
  initialExcerpt: string | null;
  initialContentHtml: string;
  initialSeoTitle: string | null;
  initialSeoDescription: string | null;
  initialSeoKeywords: string | null;
  initialCoverImageUrl: string | null;
  initialCoverImageAlt: string | null;
  initialTargetSiteId: string | null;
  initialTargetCategory: string | null;
  status: DraftStatus;
  sites: Site[];
}

export function DraftEditor({
  draftId,
  initialTitle,
  initialSlug,
  initialExcerpt,
  initialContentHtml,
  initialSeoTitle,
  initialSeoDescription,
  initialSeoKeywords,
  initialCoverImageUrl,
  initialCoverImageAlt,
  initialTargetSiteId,
  initialTargetCategory,
  status,
  sites,
}: DraftEditorProps) {
  const [fields, setFields] = useState({
    title: initialTitle,
    slug: initialSlug,
    excerpt: initialExcerpt ?? "",
    seoTitle: initialSeoTitle ?? "",
    seoDescription: initialSeoDescription ?? "",
    seoKeywords: initialSeoKeywords ?? "",
    coverImageUrl: initialCoverImageUrl ?? "",
    coverImageAlt: initialCoverImageAlt ?? "",
    targetSiteId: initialTargetSiteId ?? "",
    targetCategory: initialTargetCategory ?? "",
  });

  const [isSaving, setIsSaving] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestFieldsRef = useRef(fields);
  latestFieldsRef.current = fields;

  const saveNow = useCallback(
    async (contentHtml: string) => {
      setIsSaving(true);
      const fd = new FormData();
      const f = latestFieldsRef.current;
      fd.set("title", f.title);
      fd.set("slug", f.slug);
      fd.set("excerpt", f.excerpt);
      fd.set("contentHtml", contentHtml);
      fd.set("seoTitle", f.seoTitle);
      fd.set("seoDescription", f.seoDescription);
      fd.set("seoKeywords", f.seoKeywords);
      fd.set("coverImageUrl", f.coverImageUrl);
      fd.set("coverImageAlt", f.coverImageAlt);
      fd.set("targetSiteId", f.targetSiteId);
      fd.set("targetCategory", f.targetCategory);

      const result = await updateDraft(draftId, fd);
      setIsSaving(false);
      if (!result.ok) {
        toast.error(`Save failed: ${result.error}`);
      }
    },
    [draftId]
  );

  const editorContentRef = useRef<string>(initialContentHtml);

  const debounceSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void saveNow(editorContentRef.current);
    }, 2000);
  }, [saveNow]);

  const editor = useEditor({
    extensions: [StarterKit],
    content: initialContentHtml,
    immediatelyRender: false,
    onUpdate: ({ editor: ed }) => {
      editorContentRef.current = ed.getHTML();
      debounceSave();
    },
  });

  function handleFieldChange(field: string, value: string) {
    setFields((prev) => ({ ...prev, [field]: value }));
    debounceSave();
  }

  return (
    <div className="flex h-[calc(100vh-120px)] gap-0 border border-border rounded-lg overflow-hidden">
      {/* Left: Editor (70%) */}
      <div className="flex flex-col flex-1 min-w-0 border-r border-border">
        {/* Toolbar */}
        <div className="flex items-center gap-1 px-3 py-2 border-b border-border bg-card shrink-0">
          <EditorToolbar editor={editor} />
          <div className="ml-auto flex items-center gap-2">
            {isSaving && (
              <span className="text-xs text-muted-foreground">Saving…</span>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <EditorContent
            editor={editor}
            className={cn(
              "prose prose-invert max-w-none min-h-[400px]",
              "[&_.ProseMirror]:outline-none",
              "[&_.ProseMirror]:min-h-[400px]",
              "[&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]",
              "[&_.ProseMirror_p.is-editor-empty:first-child::before]:text-muted-foreground",
              "[&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left",
              "[&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none",
              "[&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0"
            )}
          />
        </div>
      </div>

      {/* Right: Sidebar (30%) */}
      <div className="w-[300px] shrink-0 flex flex-col bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border shrink-0">
          <h3 className="text-sm font-semibold text-foreground">Details</h3>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <EditorSidebar
            draftId={draftId}
            status={status}
            title={fields.title}
            slug={fields.slug}
            excerpt={fields.excerpt}
            seoTitle={fields.seoTitle}
            seoDescription={fields.seoDescription}
            seoKeywords={fields.seoKeywords}
            coverImageUrl={fields.coverImageUrl}
            coverImageAlt={fields.coverImageAlt}
            targetSiteId={fields.targetSiteId}
            targetCategory={fields.targetCategory}
            sites={sites}
            onFieldChange={handleFieldChange}
          />
        </div>
      </div>
    </div>
  );
}

interface EditorToolbarProps {
  editor: ReturnType<typeof useEditor> | null;
}

function EditorToolbar({ editor }: EditorToolbarProps) {
  if (!editor) return null;

  const btnClass =
    "px-2 py-1 text-xs rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40";
  const activeBtnClass = "bg-accent text-foreground";

  return (
    <div className="flex items-center gap-0.5 flex-wrap">
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={cn(btnClass, editor.isActive("bold") && activeBtnClass)}
      >
        <strong>B</strong>
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={cn(btnClass, editor.isActive("italic") && activeBtnClass)}
      >
        <em>I</em>
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleStrike().run()}
        className={cn(btnClass, editor.isActive("strike") && activeBtnClass)}
      >
        <s>S</s>
      </button>
      <span className="w-px h-4 bg-border mx-1" />
      {([1, 2, 3] as const).map((level) => (
        <button
          key={level}
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
          className={cn(
            btnClass,
            editor.isActive("heading", { level }) && activeBtnClass
          )}
        >
          H{level}
        </button>
      ))}
      <span className="w-px h-4 bg-border mx-1" />
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={cn(btnClass, editor.isActive("bulletList") && activeBtnClass)}
      >
        • List
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={cn(
          btnClass,
          editor.isActive("orderedList") && activeBtnClass
        )}
      >
        1. List
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        className={cn(btnClass, editor.isActive("blockquote") && activeBtnClass)}
      >
        &ldquo;&rdquo;
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleCode().run()}
        className={cn(btnClass, editor.isActive("code") && activeBtnClass)}
      >
        {"</>"}
      </button>
      <span className="w-px h-4 bg-border mx-1" />
      <button
        type="button"
        onClick={() => editor.chain().focus().undo().run()}
        className={cn(btnClass)}
        disabled={!editor.can().undo()}
      >
        ↩
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().redo().run()}
        className={cn(btnClass)}
        disabled={!editor.can().redo()}
      >
        ↪
      </button>
    </div>
  );
}
