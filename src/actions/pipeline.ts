"use server";

import { db } from "@/lib/db";
import { jobs } from "@/db/schema";
import { inngest } from "@/lib/inngest";
import { revalidatePath } from "next/cache";

export type PipelineInput = {
  keywords: string[];
  siteId: string;
  projectId: string;
  articleType: "howto" | "listicle";
  toneId?: string;
  wordCount?: number;
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

  for (const keyword of input.keywords) {
    const kw = keyword.trim();
    if (!kw) continue;

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
      },
    });

    jobIds.push(job!.id);
  }

  revalidatePath("/pipeline");
  revalidatePath("/drafts");
  return { ok: true, data: { jobIds, count: jobIds.length } };
}
