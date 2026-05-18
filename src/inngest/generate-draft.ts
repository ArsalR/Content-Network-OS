import { inngest } from "@/lib/inngest";
import { db } from "@/lib/db";
import { briefs, drafts, tones, promptTemplates, jobs } from "@/db/schema";
import { generate } from "@/lib/openai-client";
import { renderTemplate } from "@/lib/template";
import { eq, and } from "drizzle-orm";
import { marked } from "marked";
import { z } from "zod";

const DraftResponseSchema = z.object({
  title: z.string(),
  slug: z.string(),
  excerpt: z.string().max(300),
  contentMarkdown: z.string(),
  seoTitle: z.string().max(80),
  seoDescription: z.string().max(200),
  seoKeywords: z.string(),
});

export const generateDraft = inngest.createFunction(
  {
    id: "generate-draft",
    name: "Generate Draft",
    triggers: [{ event: "draft/generate" }],
  },
  async ({ event, step }) => {
    const { briefId, jobId } = event.data as { briefId: string; jobId: string };

    // 1. Mark job as running
    await step.run("mark-job-running", async () => {
      await db
        .update(jobs)
        .set({ status: "running", startedAt: new Date() })
        .where(eq(jobs.id, jobId));
    });

    try {
      // 2. Load brief + tone + default draft prompt template
      const brief = await step.run("load-brief", async () => {
        return db.query.briefs.findFirst({
          where: eq(briefs.id, briefId),
        });
      });

      if (!brief) {
        throw new Error(`Brief ${briefId} not found`);
      }

      const tone = await step.run("load-tone", async () => {
        if (!brief.toneId) return null;
        return db.query.tones.findFirst({
          where: eq(tones.id, brief.toneId!),
        });
      });

      const template = await step.run("load-template", async () => {
        return db.query.promptTemplates.findFirst({
          where: and(
            eq(promptTemplates.kind, "draft"),
            eq(promptTemplates.isDefault, true)
          ),
        });
      });

      // 3. Render the template with brief data
      const prompt = await step.run("render-prompt", async () => {
        const templateText =
          template?.template ??
          `Write a complete blog post based on the following brief.
Return JSON with fields: title, slug, excerpt (max 300 chars), contentMarkdown, seoTitle (max 80 chars), seoDescription (max 200 chars), seoKeywords.

Title: {{title}}
Target Keyword: {{targetKeyword}}
Word Count: {{wordCount}}
Tone: {{tone}}
Custom Instructions: {{customInstructions}}
Outline: {{outline}}
FAQ Questions: {{faqQuestions}}

Return only valid JSON.`;

        return renderTemplate(templateText, {
          title: brief.title,
          targetKeyword: brief.targetKeyword,
          wordCount: brief.wordCount,
          tone: tone?.prompt ?? "professional and informative",
          customInstructions: brief.customInstructions ?? "",
          outline: JSON.stringify(brief.outline),
          faqQuestions: JSON.stringify(brief.faqQuestions ?? []),
        });
      });

      // 4. Call generate()
      const result = await step.run("call-openai", async () => {
        return generate(prompt, { driverId: briefId });
      });

      if (!result.ok) {
        throw new Error(result.error);
      }

      // 5. Parse JSON response with Zod
      const parsed = await step.run("parse-response", async () => {
        const cleaned = result.text.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "").trim();
        const raw = JSON.parse(cleaned) as unknown;
        return DraftResponseSchema.parse(raw);
      });

      // 6. Convert markdown to HTML with marked
      const contentHtml = await step.run("convert-to-html", async () => {
        return String(await marked.parse(parsed.contentMarkdown));
      });

      // 7. Insert draft (status: 'draft')
      const draftId = await step.run("insert-draft", async () => {
        const [inserted] = await db
          .insert(drafts)
          .values({
            briefId,
            projectId: brief.projectId,
            title: parsed.title,
            slug: parsed.slug,
            excerpt: parsed.excerpt,
            contentHtml,
            contentMarkdown: parsed.contentMarkdown,
            seoTitle: parsed.seoTitle,
            seoDescription: parsed.seoDescription,
            seoKeywords: parsed.seoKeywords,
            status: "draft",
            generationCostUsd: result.costUsd.toFixed(4),
            generationModel: result.model,
            generationTokensIn: result.tokensIn,
            generationTokensOut: result.tokensOut,
          })
          .returning({ id: drafts.id });
        return inserted.id;
      });

      // 8. Update brief status to 'generated'
      await step.run("update-brief-status", async () => {
        await db
          .update(briefs)
          .set({ status: "generated", updatedAt: new Date() })
          .where(eq(briefs.id, briefId));
      });

      // 9. Mark job as completed
      await step.run("mark-job-completed", async () => {
        await db
          .update(jobs)
          .set({ status: "completed", completedAt: new Date() })
          .where(eq(jobs.id, jobId));
      });

      return { draftId };
    } catch (err) {
      // 10. On any error: mark job failed
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error";

      await step.run("mark-job-failed", async () => {
        await db
          .update(jobs)
          .set({ status: "failed", errorMessage, completedAt: new Date() })
          .where(eq(jobs.id, jobId));
      });

      throw err;
    }
  }
);
