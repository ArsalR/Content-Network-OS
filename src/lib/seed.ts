import { db } from "@/lib/db";
import { tones, promptTemplates } from "@/db/schema";
import { sql } from "drizzle-orm";

const DEFAULT_DRAFT_TEMPLATE = `You are a content writer producing a blog post for a publication.

Topic: {{title}}
Target keyword: {{targetKeyword}}
Word count: approximately {{wordCount}} words
Tone: {{toneDescription}}

Outline:
{{#outline}}
- {{h2}}
  {{#points}}
  - {{.}}
  {{/points}}
{{/outline}}

{{#customInstructions}}Additional instructions: {{customInstructions}}{{/customInstructions}}

{{#faqQuestions}}
Include an FAQ section at the end answering these questions:
- {{.}}
{{/faqQuestions}}

Output strict JSON only, matching this schema:
{
  "title": "string",
  "slug": "string (kebab-case)",
  "excerpt": "string (max 200 chars)",
  "contentMarkdown": "string (full post body in markdown, with ## H2 headings)",
  "seoTitle": "string (max 60 chars)",
  "seoDescription": "string (max 160 chars)",
  "seoKeywords": "comma, separated, keywords"
}

Do not include any text outside the JSON.`;

const PINTEREST_LISTICLE_TEMPLATE = `You are a Pinterest-optimized content writer. Write a numbered listicle that is engineered for the Pinterest feed.

Topic: {{title}}
Target keyword: {{targetKeyword}}
Number of items: {{itemCount}}
Tone: aspirational, inspiring, practical, written in second person ("you", "your"). Use power words like "stunning", "effortless", "gorgeous", "transform", "perfect", "cozy", "dreamy", "beautiful".

{{#pinterestContentStyle}}Site-wide style instructions: {{pinterestContentStyle}}{{/pinterestContentStyle}}
{{#pinterestContentExtra}}Run-specific style instructions: {{pinterestContentExtra}}{{/pinterestContentExtra}}

Structure (output Markdown only, no JSON, no preamble):

1. FIRST LINE — A single line in this exact format:
   [Cover Image Prompt] A vertical 1000x1500 Pinterest pin showing a collage of 2-3 photos of {{targetKeyword}} arranged in a flat lay or grid, with the article title "{{title}}" overlaid in bold readable text on a contrasting banner or overlay. Bright warm lifestyle photography, clean background, aspirational and beautiful. {{pinterestCoverPromptExtra}}

2. # {{title}}

3. A 3-4 sentence introduction that hooks the reader with a relatable problem or aspiration, then promises the value of the list.

4. For EACH numbered item (1 through {{itemCount}}):
   ## {n}. [Catchy, curiosity-driven subheading]
   [Section Image Prompt {n}] A vertical 1000x1500 lifestyle photo showing the EXACT item described below — include 3 specific visual details (specific colors, specific materials, specific style elements) so this image is unique and would not be confused with any other section or article. Topic context: {{targetKeyword}}, item #{n}. Bright natural lighting, clean background, Pinterest aesthetic, lifestyle photography. {{pinterestSectionPromptExtra}}

   A 100-150 word paragraph describing this item with actionable, inspiring language. Mention specific colors, materials, or style elements that make this item visually distinct from the others.

5. ## Conclusion — 2-3 sentences wrapping up with an aspirational call to action.

IMPORTANT: Each [Section Image Prompt N] must include at least 3 specific visual details unique to that exact item (specific colors, specific materials, specific style elements) so that no two images in this article look similar, and images in this article would look distinctly different from images in other articles about similar topics.

All numbered items must have unique subheadings and visually distinct image prompts. Number image prompts sequentially starting from 1. Output full Markdown only.`;

const DEFAULT_OUTLINE_TEMPLATE = `You are a content strategist creating a detailed blog post outline.

Topic: {{title}}
Target keyword: {{targetKeyword}}
Word count: approximately {{wordCount}} words
Tone: {{toneDescription}}

{{#customInstructions}}Additional instructions: {{customInstructions}}{{/customInstructions}}

Output strict JSON only, matching this schema:
{
  "outline": [
    {
      "h2": "Section heading",
      "points": ["Supporting point 1", "Supporting point 2"]
    }
  ],
  "faqQuestions": ["Question 1?", "Question 2?"]
}

Do not include any text outside the JSON.`;

export async function seedDefaults(): Promise<void> {
  const [tonesCount, templatesCount] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(tones),
    db.select({ count: sql<number>`count(*)` }).from(promptTemplates),
  ]);

  if (Number(tonesCount[0]?.count ?? 0) === 0) {
    await db.insert(tones).values([
      {
        name: "Warm & Inspiring",
        prompt:
          "Write in a warm, encouraging tone. Use personal anecdotes where appropriate. Make the reader feel understood and motivated.",
      },
      {
        name: "Professional",
        prompt:
          "Write in a clear, authoritative tone. Use data and evidence. Avoid casual language. Suitable for B2B audiences.",
      },
      {
        name: "Casual & Conversational",
        prompt:
          "Write like you're talking to a friend. Use contractions, short sentences, and everyday language.",
      },
    ]);
  }

  if (Number(templatesCount[0]?.count ?? 0) === 0) {
    await db.insert(promptTemplates).values([
      {
        name: "Default Draft",
        kind: "draft",
        isDefault: true,
        template: DEFAULT_DRAFT_TEMPLATE,
      },
      {
        name: "Default Brief Outline",
        kind: "outline",
        isDefault: true,
        template: DEFAULT_OUTLINE_TEMPLATE,
      },
      {
        name: "Pinterest Listicle",
        kind: "draft",
        isDefault: false,
        template: PINTEREST_LISTICLE_TEMPLATE,
      },
    ]);
  }
}
