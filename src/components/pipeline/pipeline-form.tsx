"use client";

import { useState, useRef, useTransition, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  runPipeline,
  expandSeedsToIdeas,
  type ExpandedSeed,
} from "@/actions/pipeline";
import { Sparkles, RotateCw, ChevronLeft } from "lucide-react";

type Site = { id: string; name: string; pinterestMode?: boolean | null };
type Project = { id: string; name: string };
type Tone = { id: string; name: string };

type Props = {
  sites: Site[];
  projects: Project[];
  tones: Tone[];
};

type ArticleType = "howto" | "listicle" | "pinterest_listicle";

/**
 * Ideas live in the form-local state as a flat keyed map so toggles and
 * inline-edits don't re-render every group. The key is "seed#index".
 */
type IdeaRow = {
  key: string;
  seed: string;
  title: string;
  selected: boolean;
};

function parseKeywordsFromCsv(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const keywords: string[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const firstCol = line.split(",")[0]?.trim() ?? "";
    if (!firstCol) continue;
    if (firstCol.toLowerCase() === "keyword") continue;
    keywords.push(firstCol);
  }
  return keywords;
}

/** Build a flat IdeaRow[] from the server's grouped result. Each row gets
 *  a unique key so re-rolls produce fresh keys — React can't reuse the
 *  old <input> elements (which would silently preserve any inline edit
 *  the user made before re-rolling). */
function ideaRowsFromExpansion(expansion: ExpandedSeed[]): IdeaRow[] {
  const rows: IdeaRow[] = [];
  for (const group of expansion) {
    for (let i = 0; i < group.ideas.length; i++) {
      rows.push({
        key: makeIdeaRowKey(),
        seed: group.seed,
        title: group.ideas[i],
        selected: true, // default everything checked; user un-checks the ones they don't want
      });
    }
  }
  return rows;
}

/** Monotonic-ish unique key for an IdeaRow. crypto.randomUUID would do but
 *  isn't worth the import here — a 36-bit suffix is more than enough for a
 *  list of at most 20 × 40 = 800 rows. */
let ideaRowKeyCounter = 0;
function makeIdeaRowKey(): string {
  ideaRowKeyCounter += 1;
  return `r${ideaRowKeyCounter}_${Math.random().toString(36).slice(2, 9)}`;
}

export function PipelineForm({ sites, projects, tones }: Props) {
  const [keywordsText, setKeywordsText] = useState("");
  const [siteId, setSiteId] = useState<string>("");
  const [projectId, setProjectId] = useState<string>("");
  const [toneId, setToneId] = useState<string>("");
  const [articleType, setArticleType] = useState<ArticleType>("howto");
  const [wordCount, setWordCount] = useState<string>("1000");
  const [pinterestContentExtra, setPinterestContentExtra] = useState<string>("");

  // Idea-expansion state.
  // `expandSeeds = true` flips the Run button from "go straight to drafts"
  // to "first ideate, then review, then drafts".
  const [expandSeeds, setExpandSeeds] = useState(false);
  const [ideasPerSeed, setIdeasPerSeed] = useState<string>("25");
  const [mode, setMode] = useState<"compose" | "review">("compose");
  const [ideaRows, setIdeaRows] = useState<IdeaRow[]>([]);

  const [result, setResult] = useState<
    { ok: true; count: number } | { ok: false; error: string } | null
  >(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // The selected site (used to detect Pinterest mode and show the badge).
  const selectedSite = sites.find((s) => s.id === siteId);
  const siteHasPinterestMode = !!selectedSite?.pinterestMode;

  // When the user picks a Pinterest-mode site, auto-switch the article type
  // to pinterest_listicle. The user can still manually change it afterwards.
  useEffect(() => {
    if (siteHasPinterestMode && articleType !== "pinterest_listicle") {
      setArticleType("pinterest_listicle");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteHasPinterestMode]);

  function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const keywords = parseKeywordsFromCsv(text);
      setKeywordsText(keywords.join("\n"));
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function seedsFromTextarea(): string[] {
    return keywordsText
      .split("\n")
      .map((k) => k.trim())
      .filter(Boolean);
  }

  /**
   * Submit handler — branches on the expandSeeds toggle. When on, kicks
   * off ideation first; the user reviews ideas before draft generation.
   */
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!siteId || !projectId) {
      setResult({ ok: false, error: "Please select a site and project." });
      return;
    }
    const seeds = seedsFromTextarea();
    if (!seeds.length) {
      setResult({ ok: false, error: "Please enter at least one keyword." });
      return;
    }

    if (expandSeeds) {
      // Ideate first, then go to review.
      startTransition(async () => {
        setResult(null);
        const perSeed = Math.max(5, Math.min(40, parseInt(ideasPerSeed) || 25));
        const res = await expandSeedsToIdeas({
          seeds,
          perSeed,
          articleType,
        });
        if (res.ok) {
          setIdeaRows(ideaRowsFromExpansion(res.data));
          setMode("review");
        } else {
          setResult({ ok: false, error: res.error });
        }
      });
      return;
    }

    // No expansion — straight to drafts as before.
    startTransition(async () => {
      const res = await runPipeline({
        keywords: seeds,
        siteId,
        projectId,
        articleType,
        toneId: toneId || undefined,
        wordCount: articleType === "howto" ? parseInt(wordCount) || 1000 : undefined,
        pinterestContentExtra:
          articleType === "pinterest_listicle" && pinterestContentExtra.trim()
            ? pinterestContentExtra.trim()
            : undefined,
      });
      if (res.ok) {
        setResult({ ok: true, count: res.data.count });
        setKeywordsText("");
      } else {
        setResult({ ok: false, error: res.error });
      }
    });
  }

  /** Re-roll: re-expand all seeds (currently displayed groups). */
  function handleRerollAll() {
    const seeds = Array.from(new Set(ideaRows.map((r) => r.seed)));
    if (!seeds.length) return;
    startTransition(async () => {
      const perSeed = Math.max(5, Math.min(40, parseInt(ideasPerSeed) || 25));
      const res = await expandSeedsToIdeas({ seeds, perSeed, articleType });
      if (res.ok) setIdeaRows(ideaRowsFromExpansion(res.data));
      else setResult({ ok: false, error: res.error });
    });
  }

  /** Re-roll only a single seed. Other groups are preserved. */
  function handleRerollSeed(seed: string) {
    startTransition(async () => {
      const perSeed = Math.max(5, Math.min(40, parseInt(ideasPerSeed) || 25));
      const res = await expandSeedsToIdeas({
        seeds: [seed],
        perSeed,
        articleType,
      });
      if (!res.ok) {
        setResult({ ok: false, error: res.error });
        return;
      }
      const newRows = ideaRowsFromExpansion(res.data);
      // Replace just this seed's rows; keep the rest as-is.
      setIdeaRows((current) => [
        ...current.filter((r) => r.seed !== seed),
        ...newRows,
      ]);
    });
  }

  /** Push the selected, edited titles through the existing runPipeline. */
  function handleGenerateSelected() {
    const selected = ideaRows
      .filter((r) => r.selected)
      .map((r) => r.title.trim())
      .filter(Boolean);
    if (!selected.length) {
      setResult({ ok: false, error: "Select at least one idea to generate." });
      return;
    }
    if (selected.length > 50) {
      setResult({
        ok: false,
        error: `Pipeline accepts max 50 articles per run (you selected ${selected.length}). Uncheck some and try again.`,
      });
      return;
    }
    startTransition(async () => {
      const res = await runPipeline({
        keywords: selected,
        siteId,
        projectId,
        articleType,
        toneId: toneId || undefined,
        wordCount: articleType === "howto" ? parseInt(wordCount) || 1000 : undefined,
        pinterestContentExtra:
          articleType === "pinterest_listicle" && pinterestContentExtra.trim()
            ? pinterestContentExtra.trim()
            : undefined,
      });
      if (res.ok) {
        setResult({ ok: true, count: res.data.count });
        setMode("compose");
        setIdeaRows([]);
        setKeywordsText("");
      } else {
        setResult({ ok: false, error: res.error });
      }
    });
  }

  // ─── Review mode ────────────────────────────────────────────────────────
  if (mode === "review") {
    return (
      <ReviewMode
        rows={ideaRows}
        setRows={setIdeaRows}
        isPending={isPending}
        result={result}
        onBack={() => {
          setMode("compose");
          setResult(null);
        }}
        onRerollAll={handleRerollAll}
        onRerollSeed={handleRerollSeed}
        onGenerate={handleGenerateSelected}
      />
    );
  }

  // ─── Compose mode (default) ─────────────────────────────────────────────
  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-6">
      <h2 className="text-base font-semibold text-foreground">
        Generate Articles
      </h2>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Keywords */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="keywords">
              {expandSeeds ? "Seed keywords (one per line)" : "Keywords (one per line)"}
            </Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              Upload CSV
            </Button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleCsvUpload}
          />
          <Textarea
            id="keywords"
            value={keywordsText}
            onChange={(e) => setKeywordsText(e.target.value)}
            placeholder={
              expandSeeds
                ? "bedroom decor\nfall outfits\ndinner recipes"
                : "how to grow tomatoes indoors\n10 best container plants\nbeginner vegetable garden tips"
            }
            rows={6}
          />
          <p className="text-xs text-muted-foreground">
            {expandSeeds
              ? "Each line is a seed topic; we'll ask OpenAI for "
                + ideasPerSeed
                + " article ideas per seed and let you curate before drafting."
              : "Max 50 keywords per run. CSV: first column is used as keyword."}
          </p>
        </div>

        {/* Site + Project row */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Site *</Label>
            <Select value={siteId} onValueChange={setSiteId} required>
              <SelectTrigger>
                <SelectValue placeholder="Select a site" />
              </SelectTrigger>
              <SelectContent>
                {sites.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Project *</Label>
            <Select value={projectId} onValueChange={setProjectId} required>
              <SelectTrigger>
                <SelectValue placeholder="Select a project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Article type */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Article Type</Label>
            {siteHasPinterestMode && (
              <span className="rounded-full bg-pink-500/15 px-2.5 py-0.5 text-[11px] font-medium text-pink-600 dark:text-pink-400">
                Pinterest Mode is enabled for this site
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="radio"
                name="articleType"
                value="howto"
                checked={articleType === "howto"}
                onChange={() => setArticleType("howto")}
                className="accent-primary"
              />
              How-to article
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="radio"
                name="articleType"
                value="listicle"
                checked={articleType === "listicle"}
                onChange={() => setArticleType("listicle")}
                className="accent-primary"
              />
              Listicle (e.g. &quot;25 Ideas&quot;)
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="radio"
                name="articleType"
                value="pinterest_listicle"
                checked={articleType === "pinterest_listicle"}
                onChange={() => setArticleType("pinterest_listicle")}
                className="accent-primary"
              />
              Pinterest Listicle (Optimized for Pinterest feed)
            </label>
          </div>
        </div>

        {/* Pinterest-only content extra instructions */}
        {articleType === "pinterest_listicle" && (
          <div className="space-y-2">
            <Label htmlFor="pinterestContentExtra">
              Pinterest Content Extra Instructions (optional)
            </Label>
            <Textarea
              id="pinterestContentExtra"
              value={pinterestContentExtra}
              onChange={(e) => setPinterestContentExtra(e.target.value)}
              rows={3}
              placeholder="e.g. focus on cozy autumn aesthetic, use warm earthy colors, keep ideas under $30, target college dorm rooms"
            />
            <p className="text-xs text-muted-foreground">
              Applies only to this run. Combined with the site&apos;s saved Pinterest content
              style.
            </p>
          </div>
        )}

        {/* Tone + Word count row */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Tone (optional)</Label>
            <Select value={toneId} onValueChange={setToneId}>
              <SelectTrigger>
                <SelectValue placeholder="Default tone" />
              </SelectTrigger>
              <SelectContent>
                {tones.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {articleType === "howto" && (
            <div className="space-y-2">
              <Label htmlFor="wordCount">Word Count</Label>
              <Input
                id="wordCount"
                type="number"
                min={300}
                max={3000}
                step={100}
                value={wordCount}
                onChange={(e) => setWordCount(e.target.value)}
              />
            </div>
          )}
        </div>

        {/* Idea-expansion toggle. Visible on every article type — the
            underlying expansion prompt adapts based on the selected
            article type so the candidate titles match the format the
            generator will actually produce. */}
        <div className="space-y-2 rounded-md border border-border bg-card/50 p-3">
          <label className="flex items-center gap-2 cursor-pointer text-sm font-medium">
            <input
              type="checkbox"
              checked={expandSeeds}
              onChange={(e) => setExpandSeeds(e.target.checked)}
              className="accent-primary"
            />
            <Sparkles className="h-4 w-4 text-primary" />
            Expand seeds into ideas first
          </label>
          {expandSeeds && (
            <div className="flex items-end gap-3 pl-6">
              <div className="space-y-1.5">
                <Label htmlFor="ideasPerSeed" className="text-xs">
                  Ideas per seed
                </Label>
                <Input
                  id="ideasPerSeed"
                  type="number"
                  min={5}
                  max={40}
                  step={1}
                  value={ideasPerSeed}
                  onChange={(e) => setIdeasPerSeed(e.target.value)}
                  className="h-8 w-24"
                />
              </div>
              <p className="text-xs text-muted-foreground pb-2">
                We&apos;ll fan out the seeds to OpenAI in parallel. Review the
                generated titles before any draft is created.
              </p>
            </div>
          )}
        </div>

        {/* Result message */}
        {result && (
          <div
            className={`rounded-md px-3 py-2 text-sm ${
              result.ok
                ? "bg-green-500/10 text-green-700 dark:text-green-400"
                : "bg-destructive/10 text-destructive"
            }`}
          >
            {result.ok
              ? `Queued ${result.count} article${result.count !== 1 ? "s" : ""} for generation.`
              : result.error}
          </div>
        )}

        <Button type="submit" disabled={isPending}>
          {isPending
            ? expandSeeds
              ? "Expanding…"
              : "Queueing…"
            : expandSeeds
              ? "Expand seeds → Review ideas"
              : "Run Pipeline"}
        </Button>
      </form>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Review-mode subcomponent — grouped by seed, with select-all / re-roll /
// inline edit. Returns user to compose mode on back; calls onGenerate when
// the user is ready to queue draft generation for the checked items.
// ─────────────────────────────────────────────────────────────────────────────

function ReviewMode({
  rows,
  setRows,
  isPending,
  result,
  onBack,
  onRerollAll,
  onRerollSeed,
  onGenerate,
}: {
  rows: IdeaRow[];
  setRows: React.Dispatch<React.SetStateAction<IdeaRow[]>>;
  isPending: boolean;
  result: { ok: true; count: number } | { ok: false; error: string } | null;
  onBack: () => void;
  onRerollAll: () => void;
  onRerollSeed: (seed: string) => void;
  onGenerate: () => void;
}) {
  // Group by seed in render order.
  const seedsInOrder = Array.from(new Set(rows.map((r) => r.seed)));
  const selectedCount = rows.filter((r) => r.selected).length;

  function toggleRow(key: string) {
    setRows((cur) =>
      cur.map((r) => (r.key === key ? { ...r, selected: !r.selected } : r))
    );
  }
  function editRow(key: string, title: string) {
    setRows((cur) => cur.map((r) => (r.key === key ? { ...r, title } : r)));
  }
  function toggleSeedSelectAll(seed: string, value: boolean) {
    setRows((cur) =>
      cur.map((r) => (r.seed === seed ? { ...r, selected: value } : r))
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onBack}>
            <ChevronLeft className="h-3.5 w-3.5" />
            Back to compose
          </Button>
          <h2 className="text-base font-semibold text-foreground">Review ideas</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {selectedCount} / {rows.length} selected
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRerollAll}
            disabled={isPending}
            className="gap-1.5"
          >
            <RotateCw
              className={`h-3 w-3 ${isPending ? "animate-spin" : ""}`}
            />
            Re-roll all
          </Button>
        </div>
      </div>

      {result && !result.ok && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {result.error}
        </div>
      )}
      {result && result.ok && (
        <div className="rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
          Queued {result.count} article{result.count !== 1 ? "s" : ""} for
          generation.
        </div>
      )}

      <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-1">
        {seedsInOrder.map((seed) => {
          const groupRows = rows.filter((r) => r.seed === seed);
          const groupSelected = groupRows.filter((r) => r.selected).length;
          const allSelected = groupSelected === groupRows.length;
          return (
            <div key={seed} className="space-y-2">
              <div className="flex items-center justify-between gap-2 sticky top-0 bg-card py-1 border-b border-border">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium text-foreground">{seed}</span>
                  <span className="text-xs text-muted-foreground">
                    {groupSelected} / {groupRows.length}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                    onClick={() => toggleSeedSelectAll(seed, !allSelected)}
                  >
                    {allSelected ? "Clear all" : "Select all"}
                  </button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onRerollSeed(seed)}
                    disabled={isPending}
                    className="h-6 px-2 text-xs gap-1"
                  >
                    <RotateCw className="h-3 w-3" />
                    Re-roll
                  </Button>
                </div>
              </div>
              <ul className="space-y-1">
                {groupRows.map((row) => (
                  <li
                    key={row.key}
                    className={`flex items-center gap-2 rounded px-2 py-1 ${
                      row.selected ? "bg-primary/5" : "opacity-60"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={row.selected}
                      onChange={() => toggleRow(row.key)}
                      className="accent-primary shrink-0"
                    />
                    <Input
                      value={row.title}
                      onChange={(e) => editRow(row.key, e.target.value)}
                      className="text-sm h-7 border-transparent bg-transparent focus:border-border focus:bg-card"
                    />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-border">
        <p className="text-xs text-muted-foreground">
          Generation runs in the background and shows up in the Pipeline →
          Drafts kanban.
        </p>
        <Button
          type="button"
          onClick={onGenerate}
          disabled={isPending || selectedCount === 0}
        >
          {isPending
            ? "Queueing…"
            : `Generate ${selectedCount} article${selectedCount === 1 ? "" : "s"}`}
        </Button>
      </div>
    </div>
  );
}
