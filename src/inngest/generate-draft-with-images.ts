import { inngest } from "@/lib/inngest";
import { db } from "@/lib/db";
import { drafts, sites, tones, jobs, keywords as keywordsTable } from "@/db/schema";
import { generate } from "@/lib/openai-client";
import { generateImage, type ImageGenResultSerializable } from "@/lib/image-gen";
import { decrypt } from "@/lib/crypto";
import { marked } from "marked";
import {
  extractImagePrompts,
  replaceImagePromptWithImg,
  extractItemCountFromTitle,
} from "@/lib/article-parser";
import { eq } from "drizzle-orm";

type GenerateWithImagesData = {
  jobId: string;
  keyword: string;
  siteId: string;
  projectId: string;
  articleType: "howto" | "listicle";
  toneId?: string;
  wordCount?: number;
  keywordId?: string;
};

export const generateDraftWithImages = inngest.createFunction(
  {
    id: "generate-draft-with-images",
    name: "Generate Draft With Images",
    triggers: [{ event: "draft/generate-with-images" }],
    timeouts: { finish: "10m" },
  },
  async ({ event, step }) => {
    const {
      jobId,
      keyword,
      siteId,
      projectId,
      articleType,
      toneId,
      wordCount,
      keywordId,
    } = event.data as GenerateWithImagesData;

    // 1. Mark job running
    await step.run("mark-job-running", async () => {
      await db
        .update(jobs)
        .set({ status: "running", startedAt: new Date() })
        .where(eq(jobs.id, jobId));
    });

    // 2. Load site
    const site = await step.run("load-site", async () => {
      const [s] = await db.select().from(sites).where(eq(sites.id, siteId));
      return s ?? null;
    });

    if (!site) throw new Error(`Site ${siteId} not found`);

    // 3. Load tone
    const toneDescription = await step.run("load-tone", async () => {
      if (!toneId) return "clear, engaging, and helpful";
      const [t] = await db.select().from(tones).where(eq(tones.id, toneId));
      return t?.prompt ?? "clear, engaging, and helpful";
    });

    // 4. Generate article text with [Image Prompt N] tags
    const articleMarkdown = await step.run("generate-article-text", async () => {
      const wc = wordCount ?? 1000;
      let prompt: string;

      if (articleType === "listicle") {
        const itemCount = extractItemCountFromTitle(keyword);
        prompt = `Write a listicle article with the title: "${keyword}"
Target keyword: "${keyword}"
Tone: ${toneDescription}
Number of items: ${itemCount}

Requirements:
1. Start with a 2-3 sentence introduction.
2. Include [Image Prompt 1] after the intro: a detailed photo description about ${keyword}. No text in image. Under 75 words.
3. For each numbered item (1 through ${itemCount}):
   ## {n}. [Unique Subheading]
   [Image Prompt {n+1}] Detailed photo description for this item, specific to the subheading. No text in image. Under 75 words.
   ~150 word paragraph about this item.
4. End with ## Conclusion paragraph.
5. All subheadings MUST be unique. Number image prompts sequentially starting from 1.

Output full Markdown only. No JSON, no preamble.`;
      } else {
        prompt = `Write an engaging how-to article with the title: "${keyword}"
Target keyword: "${keyword}"
Tone: ${toneDescription}
Approximate word count: ${wc} words

Requirements:
1. Start with a catchy 2-3 sentence introduction.
2. On a new line after the intro, include: [Image Prompt 1] A realistic, high-quality photo of: ${keyword}. Pinterest-style, no text in image. Detailed visual description under 75 words.
3. Break into 3-5 H2 sections with clear steps/explanations (~150 words each).
4. After each H2 section content, include: [Image Prompt N] describing a photo relevant to that specific section. No text. Under 75 words.
5. End with a short conclusion paragraph.
6. Number image prompts sequentially: [Image Prompt 1], [Image Prompt 2], etc.

Output full Markdown only. No JSON, no preamble.`;
      }

      const result = await generate(prompt, {
        driverId: jobId,
        rawText: true,
        systemPrompt:
          "You are an expert SEO content writer. Output only the article markdown, nothing else.",
      });
      if (!result.ok) throw new Error(`Article generation failed: ${result.error}`);
      return result.text;
    });

    // 5. Extract image prompts
    const imagePrompts = extractImagePrompts(articleMarkdown);

    // 6. Decrypt site API key inside a step so it survives retries
    const decryptedApiKey = await step.run("decrypt-api-key", async () => {
      return decrypt(site.apiKey);
    });

    // 7. Generate + upload images, replace prompt lines
    let processedMarkdown = articleMarkdown;
    let coverImageUrl: string | null = null;

    for (const prompt of imagePrompts) {
      const imgResult = await step.run(`generate-image-${prompt.number}`, async (): Promise<ImageGenResultSerializable> => {
        return generateImage(
          prompt.text,
          (site.imageProvider as "dalle" | "gemini") ?? "dalle",
          site.imageStyle ?? undefined
        );
      });

      if (!imgResult.ok) continue;

      const uploadResult = await step.run(`upload-image-${prompt.number}`, async () => {
        const filename = `article-image-${Date.now()}-${prompt.number}.png`;
        const formData = new FormData();
        const buffer = Buffer.from(imgResult.imageBase64, "base64");
        const blob = new Blob([buffer], { type: imgResult.mimeType });
        formData.append("files", blob, filename);

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 30_000);
        try {
          const res = await fetch(`${site.apiBaseUrl.replace(/\/$/, "")}/wp-json/wp/v2/media`, {
            method: "POST",
            headers: { Authorization: `Bearer ${decryptedApiKey}` },
            body: formData,
            signal: controller.signal,
          });
          clearTimeout(timer);
          if (!res.ok) {
            return { ok: false as const, error: `Upload failed: ${res.status}` };
          }
          const data = (await res.json()) as { source_url?: string; link?: string };
          const url = data.source_url ?? data.link ?? null;
          if (!url) return { ok: false as const, error: "No URL in upload response" };
          return { ok: true as const, url };
        } catch (e) {
          clearTimeout(timer);
          return { ok: false as const, error: String(e) };
        }
      });

      if (!uploadResult.ok) continue;

      const imgUrl = uploadResult.url;
      if (!coverImageUrl) coverImageUrl = imgUrl;

      processedMarkdown = replaceImagePromptWithImg(
        processedMarkdown,
        prompt.number,
        imgUrl,
        `Image ${prompt.number}: ${prompt.text.slice(0, 60)}`
      );
    }

    // 8. Convert markdown to HTML
    const contentHtml = await step.run("convert-to-html", async () => {
      return String(await marked.parse(processedMarkdown));
    });

    // 9. Extract title from first H1 or use keyword
    const titleMatch = processedMarkdown.match(/^#\s+(.+)$/m);
    const title = titleMatch?.[1]?.trim() ?? keyword;
    const slug = keyword
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    // 10. Save draft
    const draftId = await step.run("save-draft", async () => {
      const [draft] = await db
        .insert(drafts)
        .values({
          projectId,
          title,
          slug,
          contentHtml,
          contentMarkdown: processedMarkdown,
          coverImageUrl,
          status: "draft",
          targetSiteId: siteId,
          generationModel: "gpt-4o-mini",
        })
        .returning({ id: drafts.id });

      if (keywordId) {
        await db
          .update(keywordsTable)
          .set({ status: "generated" })
          .where(eq(keywordsTable.id, keywordId));
      }

      return draft!.id;
    });

    // 11. Mark job completed
    await step.run("complete-job", async () => {
      await db
        .update(jobs)
        .set({ status: "completed", completedAt: new Date() })
        .where(eq(jobs.id, jobId));
    });

    return { draftId };
  }
);
