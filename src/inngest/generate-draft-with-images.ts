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
  extractCoverImagePrompt,
  removeCoverImagePromptLine,
} from "@/lib/article-parser";
import { eq } from "drizzle-orm";

type GenerateWithImagesData = {
  jobId: string;
  keyword: string;
  siteId: string;
  projectId: string;
  articleType: "howto" | "listicle" | "pinterest_listicle";
  toneId?: string;
  wordCount?: number;
  keywordId?: string;
  pinterestMode?: boolean;
  pinterestContentExtra?: string;
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
      pinterestMode: pinterestModeFromEvent,
      pinterestContentExtra,
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

    // Determine Pinterest mode: explicit articleType, explicit event flag, or site default.
    // This keeps backward compatibility — old events without these fields still work normally.
    const sitePinterestMode = site.pinterestMode ?? false;
    const pinterestMode =
      articleType === "pinterest_listicle" ||
      pinterestModeFromEvent === true ||
      (articleType === "listicle" && sitePinterestMode === true);

    // Read all optional Pinterest fields from the site (null-safe).
    const pinterestCoverPromptExtra = site.pinterestCoverPromptExtra ?? "";
    const pinterestSectionPromptExtra = site.pinterestSectionPromptExtra ?? "";
    const pinterestContentStyle = site.pinterestContentStyle ?? "";

    // 3. Load tone
    const toneDescription = await step.run("load-tone", async () => {
      if (!toneId) return "clear, engaging, and helpful";
      const [t] = await db.select().from(tones).where(eq(tones.id, toneId));
      return t?.prompt ?? "clear, engaging, and helpful";
    });

    // 4. Generate article text with [Image Prompt N] / [Cover Image Prompt] tags
    const articleMarkdown = await step.run("generate-article-text", async () => {
      const wc = wordCount ?? 1000;
      let prompt: string;

      if (pinterestMode) {
        // Pinterest-optimized listicle prompt — produces a [Cover Image Prompt] at the
        // top and [Section Image Prompt N] for each numbered item.
        const itemCount = extractItemCountFromTitle(keyword);
        const styleBits = [pinterestContentStyle, pinterestContentExtra]
          .filter(Boolean)
          .join("\n");

        prompt = `Write a Pinterest-optimized numbered listicle with the title: "${keyword}"
Target keyword: "${keyword}"
Number of items: ${itemCount}
Tone: aspirational, inspiring, practical, in second person ("you", "your"). Use power words like "stunning", "effortless", "gorgeous", "transform", "perfect", "cozy", "dreamy", "beautiful".
${styleBits ? `Additional style instructions:\n${styleBits}\n` : ""}
Structure (Markdown only — no JSON, no preamble):

1. The VERY FIRST LINE must be exactly:
   [Cover Image Prompt] A vertical 1000x1500 Pinterest pin showing a collage of 2-3 photos of ${keyword} arranged in a flat lay or grid, with the article title "${keyword}" overlaid in bold readable text on a contrasting banner or overlay. Bright warm lifestyle photography, clean background, aspirational and beautiful.${pinterestCoverPromptExtra ? ` ${pinterestCoverPromptExtra}` : ""}

2. # ${keyword}

3. A 3-4 sentence introduction that hooks the reader with a relatable problem or aspiration.

4. For EACH numbered item (1 through ${itemCount}):
   ## {n}. [Catchy, curiosity-driven subheading]
   [Section Image Prompt {n}] A vertical 1000x1500 lifestyle photo specifically showing the EXACT item described in this section — include 3 specific visual details (specific colors, specific materials, specific style elements) so this image is unique. Context: ${keyword}, item #{n}. Bright natural lighting, clean background, Pinterest aesthetic, lifestyle photography.${pinterestSectionPromptExtra ? ` ${pinterestSectionPromptExtra}` : ""}

   A 100-150 word paragraph describing this item with actionable, inspiring language. Include specific colors, materials, or style details so this item feels visually distinct from the others.

5. ## Conclusion — 2-3 sentences wrapping up with an aspirational call to action.

IMPORTANT: Each [Section Image Prompt N] must include at least 3 specific visual details unique to that exact item (specific colors, specific materials, specific style elements) so that no two images in this article look similar, and images in this article would look distinctly different from images in other articles about similar topics.

All numbered items must have unique subheadings and visually distinct image prompts. Number image prompts sequentially starting from 1. Output full Markdown only.`;
      } else if (articleType === "listicle") {
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

    // 5a. Pinterest cover image (only when in Pinterest mode and a [Cover Image Prompt] is present)
    const coverPromptText = pinterestMode ? extractCoverImagePrompt(articleMarkdown) : null;

    // 5b. Section image prompts (also matches [Section Image Prompt N] format)
    const imagePrompts = extractImagePrompts(articleMarkdown);

    // Strip the cover prompt line from the markdown body so it never appears in the article.
    let processedMarkdown = pinterestMode
      ? removeCoverImagePromptLine(articleMarkdown)
      : articleMarkdown;

    // 6. Decrypt site API key inside a step so it survives retries
    const decryptedApiKey = await step.run("decrypt-api-key", async () => {
      return decrypt(site.apiKey);
    });

    /**
     * Generate an image, upload to WordPress media library, and return the URL.
     * Returns null on any failure so the article generation can continue.
     */
    async function generateAndUploadImage(
      promptText: string,
      keySuffix: string
    ): Promise<string | null> {
      const imgResult: ImageGenResultSerializable = await step.run(
        `generate-image-${keySuffix}`,
        async (): Promise<ImageGenResultSerializable> => {
          return generateImage(
            promptText,
            (site.imageProvider as "dalle" | "gemini") ?? "dalle",
            site.imageStyle ?? undefined,
            pinterestMode
          );
        }
      );

      if (!imgResult.ok) return null;

      const uploadResult = await step.run(`upload-image-${keySuffix}`, async () => {
        const filename = `article-image-${Date.now()}-${keySuffix}.png`;
        const formData = new FormData();
        const buffer = Buffer.from(imgResult.imageBase64, "base64");
        const blob = new Blob([buffer], { type: imgResult.mimeType });
        formData.append("files", blob, filename);

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 30_000);
        try {
          const res = await fetch(
            `${site.apiBaseUrl.replace(/\/$/, "")}/wp-json/wp/v2/media`,
            {
              method: "POST",
              headers: { Authorization: `Bearer ${decryptedApiKey}` },
              body: formData,
              signal: controller.signal,
            }
          );
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

      return uploadResult.ok ? uploadResult.url : null;
    }

    // 7a. Generate Pinterest cover image FIRST (if applicable)
    let coverImageUrl: string | null = null;
    if (coverPromptText) {
      coverImageUrl = await generateAndUploadImage(coverPromptText, "cover");
    }

    // 7b. Generate + upload section images, replace prompt lines
    for (const prompt of imagePrompts) {
      const uploadedUrl = await generateAndUploadImage(prompt.text, String(prompt.number));
      if (!uploadedUrl) continue;

      // In non-Pinterest mode the first section image doubles as the cover (legacy behaviour).
      if (!coverImageUrl) coverImageUrl = uploadedUrl;

      processedMarkdown = replaceImagePromptWithImg(
        processedMarkdown,
        prompt.number,
        uploadedUrl,
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
