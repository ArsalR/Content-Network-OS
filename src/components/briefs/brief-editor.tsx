"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateBrief } from "@/actions/briefs";

type OutlineItem = { h2: string; points: string[] };

interface Tone {
  id: string;
  name: string;
}

interface Brief {
  id: string;
  projectId: string;
  title: string;
  targetKeyword: string;
  wordCount: number;
  toneId: string | null;
  customInstructions: string | null;
  outline: OutlineItem[];
  faqQuestions: string[] | null;
}

interface Props {
  brief: Brief;
  tones: Tone[];
}

export function BriefEditor({ brief, tones }: Props) {
  const [title, setTitle] = useState(brief.title);
  const [targetKeyword, setTargetKeyword] = useState(brief.targetKeyword);
  const [wordCount, setWordCount] = useState(brief.wordCount);
  const [toneId, setToneId] = useState(brief.toneId ?? "");
  const [customInstructions, setCustomInstructions] = useState(
    brief.customInstructions ?? ""
  );
  const [outline, setOutline] = useState<OutlineItem[]>(brief.outline);
  const [faqQuestions, setFaqQuestions] = useState<string[]>(
    brief.faqQuestions ?? []
  );
  const [expandedSections, setExpandedSections] = useState<Set<number>>(
    new Set(outline.map((_, i) => i))
  );
  const [isPending, startTransition] = useTransition();
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">(
    "idle"
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function toggleSection(idx: number) {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  }

  // Outline helpers
  function addOutlineSection() {
    setOutline((prev) => [...prev, { h2: "", points: [] }]);
    setExpandedSections((prev) => new Set([...prev, outline.length]));
  }

  function removeOutlineSection(idx: number) {
    setOutline((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateOutlineH2(idx: number, value: string) {
    setOutline((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, h2: value } : item))
    );
  }

  function addPoint(sectionIdx: number) {
    setOutline((prev) =>
      prev.map((item, i) =>
        i === sectionIdx ? { ...item, points: [...item.points, ""] } : item
      )
    );
  }

  function updatePoint(sectionIdx: number, pointIdx: number, value: string) {
    setOutline((prev) =>
      prev.map((item, i) =>
        i === sectionIdx
          ? {
              ...item,
              points: item.points.map((p, j) => (j === pointIdx ? value : p)),
            }
          : item
      )
    );
  }

  function removePoint(sectionIdx: number, pointIdx: number) {
    setOutline((prev) =>
      prev.map((item, i) =>
        i === sectionIdx
          ? { ...item, points: item.points.filter((_, j) => j !== pointIdx) }
          : item
      )
    );
  }

  // FAQ helpers
  function addFaq() {
    setFaqQuestions((prev) => [...prev, ""]);
  }

  function updateFaq(idx: number, value: string) {
    setFaqQuestions((prev) => prev.map((q, i) => (i === idx ? value : q)));
  }

  function removeFaq(idx: number) {
    setFaqQuestions((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleSave() {
    setSaveStatus("idle");
    setErrorMsg(null);
    const formData = new FormData();
    formData.set("title", title);
    formData.set("targetKeyword", targetKeyword);
    formData.set("wordCount", String(wordCount));
    formData.set("toneId", toneId);
    formData.set("customInstructions", customInstructions);
    formData.set("outline", JSON.stringify(outline));
    formData.set("faqQuestions", JSON.stringify(faqQuestions));

    startTransition(async () => {
      const result = await updateBrief(brief.id, formData);
      if (result.ok) {
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
      } else {
        setSaveStatus("error");
        setErrorMsg(result.error);
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Basic fields */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Blog post title"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="targetKeyword">Target Keyword</Label>
          <Input
            id="targetKeyword"
            value={targetKeyword}
            onChange={(e) => setTargetKeyword(e.target.value)}
            placeholder="Primary keyword"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wordCount">Word Count</Label>
          <Input
            id="wordCount"
            type="number"
            min={100}
            max={20000}
            value={wordCount}
            onChange={(e) => setWordCount(Number(e.target.value))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="toneId">Tone</Label>
          <select
            id="toneId"
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            value={toneId}
            onChange={(e) => setToneId(e.target.value)}
          >
            <option value="">— None —</option>
            {tones.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Custom instructions */}
      <div className="space-y-1.5">
        <Label htmlFor="customInstructions">Custom Instructions</Label>
        <textarea
          id="customInstructions"
          rows={3}
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder="Any special instructions for content generation…"
          value={customInstructions}
          onChange={(e) => setCustomInstructions(e.target.value)}
        />
      </div>

      {/* Outline */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Outline</h3>
          <Button size="sm" variant="outline" onClick={addOutlineSection}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Section
          </Button>
        </div>

        {outline.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No sections yet. Click &ldquo;Add Section&rdquo; to start building
            your outline.
          </p>
        )}

        <div className="space-y-2">
          {outline.map((section, sIdx) => (
            <div
              key={sIdx}
              className="rounded-md border border-border bg-card"
            >
              <div className="flex items-center gap-2 p-3">
                <button
                  type="button"
                  onClick={() => toggleSection(sIdx)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {expandedSections.has(sIdx) ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>
                <Input
                  className="flex-1 h-7 text-sm"
                  placeholder="H2 section title"
                  value={section.h2}
                  onChange={(e) => updateOutlineH2(sIdx, e.target.value)}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => removeOutlineSection(sIdx)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              {expandedSections.has(sIdx) && (
                <div className="border-t border-border px-3 pb-3 pt-2 space-y-2">
                  {section.points.map((point, pIdx) => (
                    <div key={pIdx} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">•</span>
                      <Input
                        className="flex-1 h-7 text-xs"
                        placeholder="Talking point"
                        value={point}
                        onChange={(e) => updatePoint(sIdx, pIdx, e.target.value)}
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={() => removePoint(sIdx, pIdx)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-xs text-muted-foreground"
                    onClick={() => addPoint(sIdx)}
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    Add point
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* FAQ Questions */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">
            FAQ Questions
          </h3>
          <Button size="sm" variant="outline" onClick={addFaq}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Question
          </Button>
        </div>

        {faqQuestions.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No FAQ questions yet.
          </p>
        )}

        <div className="space-y-2">
          {faqQuestions.map((q, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{idx + 1}.</span>
              <Input
                className="flex-1 text-sm"
                placeholder="FAQ question"
                value={q}
                onChange={(e) => updateFaq(idx, e.target.value)}
              />
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => removeFaq(idx)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3 border-t border-border pt-4">
        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? "Saving…" : "Save Brief"}
        </Button>
        {saveStatus === "saved" && (
          <span className="text-xs text-green-400">Saved!</span>
        )}
        {saveStatus === "error" && errorMsg && (
          <span className="text-xs text-red-400">{errorMsg}</span>
        )}
      </div>
    </div>
  );
}
