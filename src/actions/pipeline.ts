"use server";

import { db } from "@/lib/db";
import { jobs } from "@/db/schema";
import { inngest } from "@/lib/inngest";
import { revalidatePath } from "next/cache";
import { generate } from "@/lib/openai-client";

export type PipelineInput = {
  keywords: string[];
  siteId: string;
  projectId: string;
  articleType: "howto" | "listicle" | "pinterest_listicle";
  toneId?: string;
  wordCount?: number;
  pinterestContentExtra?: string;
};

export async function runPipeline(
  input: PipelineInput
): Promise<
  { ok: true; data: { jobIds: string[]; count: number } } | { ok: false; error: string }
> {
  if (!input.keywords.length) return { ok: false, error: "No keywords provided" };
  if (input.keywords.length > 50)
    return { ok: false, error: "Maximum 50 keywords per run" };

  const jobIds: string[] = [];
  const errors: string[] = [];

  for (const keyword of input.keywords) {
    const kw = keyword.trim();
    if (!kw) continue;

    try {
      const [job] = await db
        .insert(jobs)
        .values({
          kind: "generate-draft-with-images",
          status: "queued",
          inputId: `${input.siteId}:${kw}`,
        })
        .returning({ id: jobs.id });

      await inngest.send({
        name: "draft/generate-with-images",
        data: {
          jobId: job!.id,
          keyword: kw,
          siteId: input.siteId,
          projectId: input.projectId,
          articleType: input.articleType,
          toneId: input.toneId,
          wordCount: input.wordCount,
          // Pinterest mode is also auto-detected from the site config inside
          // the Inngest function, so this is just an explicit hint.
          pinterestMode: input.articleType === "pinterest_listicle" ? true : undefined,
          pinterestContentExtra: input.pinterestContentExtra,
        },
      });

      jobIds.push(job!.id);
    } catch (err) {
      errors.push(`"${kw}": ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }

  revalidatePath("/pipeline");
  revalidatePath("/drafts");

  if (jobIds.length === 0 && errors.length > 0) {
    return { ok: false, error: `All keywords failed: ${errors.join("; ")}` };
  }

  return { ok: true, data: { jobIds, count: jobIds.length } };
}

// ─────────────────────────────────────────────────────────────────────────────
// Idea expansion — explode a list of seed keywords into N Pinterest-tuned
// article ideas per seed. No DB writes; ideation is ephemeral. The UI lets
// the user curate the result before queueing the actual draft generation
// via runPipeline().
// ─────────────────────────────────────────────────────────────────────────────

export type ExpandSeedsInput = {
  seeds: string[];
  /** Default 25. Capped at 40 per seed to keep prompts cheap and parseable. */
  perSeed?: number;
  /** Tunes the expansion prompt — Pinterest mode produces pin-friendly titles. */
  articleType?: "howto" | "listicle" | "pinterest_listicle";
};

export type ExpandedSeed = {
  seed: string;
  ideas: string[];
};

export async function expandSeedsToIdeas(
  input: ExpandSeedsInput
): Promise<
  { ok: true; data: ExpandedSeed[] } | { ok: false; error: string }
> {
  const cleanSeeds = (input.seeds ?? [])
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (cleanSeeds.length === 0) return { ok: false, error: "No seed keywords provided" };
  if (cleanSeeds.length > 20)
    return { ok: false, error: "Maximum 20 seeds per expansion (got " + cleanSeeds.length + ")" };

  const perSeed = Math.max(5, Math.min(40, input.perSeed ?? 25));
  const articleType = input.articleType ?? "pinterest_listicle";

  // Fan out one LLM call per seed in parallel. Each returns a list of ideas
  // or an empty list on failure (logged via lib/openai-client's apiCalls).
  const results = await Promise.all(
    cleanSeeds.map(async (seed) => {
      const ideas = await generateIdeasForSeed(seed, perSeed, articleType);
      return { seed, ideas };
    })
  );

  // If every seed produced zero ideas, surface that as an error so the UI
  // can show a clean message instead of "review 0 ideas".
  const totalIdeas = results.reduce((acc, r) => acc + r.ideas.length, 0);
  if (totalIdeas === 0) {
    return {
      ok: false,
      error:
        "OpenAI didn't return any ideas. Check that OPENAI_API_KEY is configured and that the seed keywords are well-formed.",
    };
  }

  return { ok: true, data: results };
}

/**
 * Generate N article ideas for a single seed keyword. Returns [] on any
 * failure — the caller decides whether an empty group is an error or just
 * a partial result.
 */
async function generateIdeasForSeed(
  seed: string,
  perSeed: number,
  articleType: "howto" | "listicle" | "pinterest_listicle"
): Promise<string[]> {
  const styleHints =
    articleType === "pinterest_listicle"
      ? `These are Pinterest article titles. They must be:
- specific long-tail variants of the seed (audience, budget, occasion, style, season, location)
- benefit-led or curiosity-driven (e.g. "25 Hotel-Style Bedroom Decor Ideas That Look Expensive on a Budget")
- include a clear number when natural (e.g. "21 ...", "30 ...") so they read as listicle pins
- under ~80 characters each — Pinterest cuts long titles in the feed
- distinct from each other (no two titles target the same angle or audience)
- written in title case`
      : articleType === "listicle"
        ? `These are listicle titles. They must include a clear number, target different audiences/use-cases/styles, and be distinct from each other.`
        : `These are how-to article titles. They must be specific (e.g. "How to ... in 5 steps", "How to ... without ...") and target distinct sub-questions of the seed.`;

  const prompt = `Generate ${perSeed} article ideas that expand the seed keyword "${seed}" into specific long-tail article titles.

${styleHints}

Return STRICT JSON only:

{
  "ideas": ["Title 1", "Title 2", "Title 3", "..."]
}

Exactly ${perSeed} ideas. No commentary, no markdown fences.`;

  const res = await generate(prompt, {
    systemPrompt:
      "You are a Pinterest SEO assistant. Output only the JSON object. No prose.",
  });
  if (!res.ok) return [];

  // Tolerate accidental ``` fences the model sometimes adds.
  const cleaned = res.text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object") return [];
  const arr = (parsed as Record<string, unknown>).ideas;
  if (!Array.isArray(arr)) return [];

  return arr
    .filter((s): s is string => typeof s === "string")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, perSeed);
}
