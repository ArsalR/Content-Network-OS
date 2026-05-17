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
{{#faqQuestions}}
- {{.}}
{{/faqQuestions}}
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
    ]);
  }
}
