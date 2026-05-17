import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(1),
  BETTER_AUTH_URL: z.string().url(),
  OPENAI_API_KEY: z.string().optional().default(""),
  PEXELS_API_KEY: z.string().optional().default(""),
  INNGEST_EVENT_KEY: z.string().optional().default(""),
  INNGEST_SIGNING_KEY: z.string().optional().default(""),
  GEMINI_API_KEY: z.string().optional().default(""),
  DALLE_IMAGE_SIZE: z.string().optional().default("1024x1024"),
  ENCRYPTION_KEY: z.string().min(1),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const missing = parsed.error.errors
    .map((e) => `  ${e.path.join(".")}: ${e.message}`)
    .join("\n");
  throw new Error(`Missing or invalid environment variables:\n${missing}`);
}

export const env = parsed.data;
