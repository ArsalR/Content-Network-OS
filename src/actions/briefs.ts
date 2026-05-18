"use server";

import { db } from "@/lib/db";
import { briefs, keywords, projects, tones } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { generate } from "@/lib/openai-client";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };

type OutlineItem = { h2: string; points: string[] };

const briefResponseSchema = z.object({
  title: z.string(),
  targetKeyword: z.string(),
  outline: z.array(
    z.object({
      h2: z.string(),
      points: z.array(z.string()),
    })
  ),
  faqQuestions: z.array(z.string()),
});

// ────────────────────────────────────────────────────────────────────────────
// createBrief
// ────────────────────────────────────────────────────────────────────────────

export async function createBrief(
  projectId: string,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const title = (formData.get("title") as string | null)?.trim();
  const targetKeyword = (formData.get("targetKeyword") as string | null)?.trim();
  const wordCount = parseInt((formData.get("wordCount") as string) ?? "1200", 10);
  const toneId = (formData.get("toneId") as string | null) || null;
  const customInstructions =
    (formData.get("customInstructions") as string | null)?.trim() || null;

  if (!title) return { ok: false, error: "Title is required" };
  if (!targetKeyword) return { ok: false, error: "Target keyword is required" };

  const outline: OutlineItem[] = [];

  try {
    const [row] = await db
      .insert(briefs)
      .values({
        projectId,
        title,
        targetKeyword,
        outline,
        wordCount: isNaN(wordCount) ? 1200 : wordCount,
        toneId,
        customInstructions,
        status: "draft",
      })
      .returning({ id: briefs.id });

    revalidatePath(`/projects/${projectId}/briefs`);
    return { ok: true, data: { id: row!.id } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to create brief",
    };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// updateBrief
// ────────────────────────────────────────────────────────────────────────────

export async function updateBrief(
  id: string,
  formData: FormData
): Promise<ActionResult<null>> {
  const title = (formData.get("title") as string | null)?.trim();
  const targetKeyword = (formData.get("targetKeyword") as string | null)?.trim();
  const wordCount = parseInt((formData.get("wordCount") as string) ?? "1200", 10);
  const toneId = (formData.get("toneId") as string | null) || null;
  const customInstructions =
    (formData.get("customInstructions") as string | null)?.trim() || null;

  const outlineRaw = formData.get("outline") as string | null;
  const faqRaw = formData.get("faqQuestions") as string | null;

  let outline: OutlineItem[] = [];
  let faqQuestions: string[] | null = null;

  try {
    if (outlineRaw) outline = JSON.parse(outlineRaw) as OutlineItem[];
  } catch {
    return { ok: false, error: "Invalid outline JSON" };
  }

  try {
    if (faqRaw) faqQuestions = JSON.parse(faqRaw) as string[];
  } catch {
    return { ok: false, error: "Invalid faqQuestions JSON" };
  }

  if (!title) return { ok: false, error: "Title is required" };
  if (!targetKeyword) return { ok: false, error: "Target keyword is required" };

  try {
    const existing = await db.query.briefs.findFirst({
      where: eq(briefs.id, id),
      columns: { projectId: true },
    });
    if (!existing) return { ok: false, error: "Brief not found" };

    await db
      .update(briefs)
      .set({
        title,
        targetKeyword,
        wordCount: isNaN(wordCount) ? 1200 : wordCount,
        toneId,
        customInstructions,
        outline,
        faqQuestions,
        updatedAt: new Date(),
      })
      .where(eq(briefs.id, id));

    revalidatePath(`/projects/${existing.projectId}/briefs`);
    revalidatePath(`/projects/${existing.projectId}/briefs/${id}`);
    return { ok: true, data: null };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to update brief",
    };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// deleteBrief
// ────────────────────────────────────────────────────────────────────────────

export async function deleteBrief(id: string): Promise<ActionResult<null>> {
  try {
    const existing = await db.query.briefs.findFirst({
      where: eq(briefs.id, id),
      columns: { projectId: true },
    });
    if (!existing) return { ok: false, error: "Brief not found" };

    await db.delete(briefs).where(eq(briefs.id, id));

    revalidatePath(`/projects/${existing.projectId}/briefs`);
    return { ok: true, data: null };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to delete brief",
    };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// markBriefReady
// ────────────────────────────────────────────────────────────────────────────

export async function markBriefReady(id: string): Promise<ActionResult<null>> {
  try {
    const existing = await db.query.briefs.findFirst({
      where: eq(briefs.id, id),
      columns: { projectId: true },
    });
    if (!existing) return { ok: false, error: "Brief not found" };

    await db
      .update(briefs)
      .set({ status: "ready", updatedAt: new Date() })
      .where(eq(briefs.id, id));

    revalidatePath(`/projects/${existing.projectId}/briefs`);
    return { ok: true, data: null };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to update brief status",
    };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// generateBriefFromKeyword
// ────────────────────────────────────────────────────────────────────────────

export async function generateBriefFromKeyword(
  keywordId: string,
  projectId: string
): Promise<ActionResult<{ briefId: string }>> {
  try {
    const keyword = await db.query.keywords.findFirst({
      where: eq(keywords.id, keywordId),
    });
    if (!keyword) return { ok: false, error: "Keyword not found" };

    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId),
    });
    if (!project) return { ok: false, error: "Project not found" };

    let tonePrompt: string | null = null;
    if (project.defaultTone) {
      const tone = await db.query.tones.findFirst({
        where: eq(tones.id, project.defaultTone),
      });
      if (tone) tonePrompt = tone.prompt;
    }

    const prompt = [
      `Generate a blog post brief for the keyword: "${keyword.keyword}"`,
      tonePrompt ? `Tone guidance: ${tonePrompt}` : null,
      `Return JSON with: { "title": string, "targetKeyword": string, "outline": [{"h2": string, "points": string[]}], "faqQuestions": string[] }`,
      `Keep the outline to 5-7 H2 sections. Include 3-5 FAQ questions.`,
    ]
      .filter(Boolean)
      .join("\n");

    const genResult = await generate(prompt, {
      driverId: keywordId,
      systemPrompt:
        "You are a professional content strategist. Always respond with valid JSON only.",
    });

    if (!genResult.ok) {
      return { ok: false, error: genResult.error };
    }

    let parsed: z.infer<typeof briefResponseSchema>;
    try {
      const cleaned = genResult.text.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "").trim();
      const raw = JSON.parse(cleaned) as unknown;
      parsed = briefResponseSchema.parse(raw);
    } catch {
      return { ok: false, error: "Failed to parse AI response as valid brief JSON" };
    }

    const [row] = await db
      .insert(briefs)
      .values({
        projectId,
        keywordId,
        title: parsed.title,
        targetKeyword: parsed.targetKeyword,
        outline: parsed.outline,
        wordCount: project.defaultWordCount,
        toneId: null,
        faqQuestions: parsed.faqQuestions,
        status: "draft",
      })
      .returning({ id: briefs.id });

    await db
      .update(keywords)
      .set({ status: "briefed" })
      .where(eq(keywords.id, keywordId));

    revalidatePath(`/projects/${projectId}/briefs`);
    revalidatePath(`/projects/${projectId}/keywords`);

    return { ok: true, data: { briefId: row!.id } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to generate brief",
    };
  }
}
