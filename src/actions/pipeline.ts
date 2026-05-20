"use server";

import { db } from "@/lib/db";
import { jobs } from "@/db/schema";
import { inngest } from "@/lib/inngest";
import { revalidatePath } from "next/cache";

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
