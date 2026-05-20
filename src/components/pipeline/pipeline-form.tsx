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
import { runPipeline } from "@/actions/pipeline";

type Site = { id: string; name: string; pinterestMode?: boolean | null };
type Project = { id: string; name: string };
type Tone = { id: string; name: string };

type Props = {
  sites: Site[];
  projects: Project[];
  tones: Tone[];
};

type ArticleType = "howto" | "listicle" | "pinterest_listicle";

function parseKeywordsFromCsv(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const keywords: string[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const firstCol = line.split(",")[0]?.trim() ?? "";
    if (!firstCol) continue;
    // Skip header row
    if (firstCol.toLowerCase() === "keyword") continue;
    keywords.push(firstCol);
  }
  return keywords;
}

export function PipelineForm({ sites, projects, tones }: Props) {
  const [keywordsText, setKeywordsText] = useState("");
  const [siteId, setSiteId] = useState<string>("");
  const [projectId, setProjectId] = useState<string>("");
  const [toneId, setToneId] = useState<string>("");
  const [articleType, setArticleType] = useState<ArticleType>("howto");
  const [wordCount, setWordCount] = useState<string>("1000");
  const [pinterestContentExtra, setPinterestContentExtra] = useState<string>("");
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
    // We intentionally only react to siteHasPinterestMode flipping true;
    // we do not auto-revert if the user manually picks another type later.
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
    // Reset input so same file can be re-uploaded
    e.target.value = "";
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!siteId || !projectId) {
      setResult({ ok: false, error: "Please select a site and project." });
      return;
    }

    const keywords = keywordsText
      .split("\n")
      .map((k) => k.trim())
      .filter(Boolean);

    if (!keywords.length) {
      setResult({ ok: false, error: "Please enter at least one keyword." });
      return;
    }

    startTransition(async () => {
      const res = await runPipeline({
        keywords,
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

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-6">
      <h2 className="text-base font-semibold text-foreground">
        Generate Articles
      </h2>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Keywords */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="keywords">Keywords (one per line)</Label>
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
            placeholder={"how to grow tomatoes indoors\n10 best container plants\nbeginner vegetable garden tips"}
            rows={6}
          />
          <p className="text-xs text-muted-foreground">
            Max 50 keywords per run. CSV: first column is used as keyword.
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
          {isPending ? "Queueing..." : "Run Pipeline"}
        </Button>
      </form>
    </div>
  );
}
