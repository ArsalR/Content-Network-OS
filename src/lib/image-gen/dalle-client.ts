import { env } from "@/lib/env";

type ImageGenResult =
  | { ok: true; imageBuffer: Buffer; mimeType: string }
  | { ok: false; error: string };

type DalleResponse = {
  data?: Array<{ url?: string; b64_json?: string }>;
  error?: { message: string };
};

export async function generateImageDalle(
  prompt: string,
  sizeOverride?: string
): Promise<ImageGenResult> {
  if (!env.OPENAI_API_KEY) {
    return { ok: false, error: "OpenAI API key not configured" };
  }

  const validSizes = ["1024x1024", "1792x1024", "1024x1792"] as const;
  type DalleSize = (typeof validSizes)[number];

  // Prefer explicit override (if valid), else fall back to env, else default square.
  const isValidDalleSize = (v: string): v is DalleSize =>
    (validSizes as readonly string[]).includes(v);

  let size: DalleSize = "1024x1024";
  if (sizeOverride && isValidDalleSize(sizeOverride)) {
    size = sizeOverride;
  } else if (env.DALLE_IMAGE_SIZE && isValidDalleSize(env.DALLE_IMAGE_SIZE)) {
    size = env.DALLE_IMAGE_SIZE;
  }

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "dall-e-3",
      prompt,
      n: 1,
      size,
      response_format: "url",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: `DALL-E API error ${res.status}: ${text.slice(0, 200)}` };
  }

  const data = (await res.json()) as DalleResponse;
  const url = data.data?.[0]?.url;
  if (!url) {
    return { ok: false, error: "No image URL returned from DALL-E" };
  }

  const imgRes = await fetch(url);
  if (!imgRes.ok) {
    return { ok: false, error: `Failed to download image: ${imgRes.status}` };
  }

  const buffer = Buffer.from(await imgRes.arrayBuffer());
  return { ok: true, imageBuffer: buffer, mimeType: "image/png" };
}
