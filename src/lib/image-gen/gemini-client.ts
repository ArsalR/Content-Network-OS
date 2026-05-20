import { env } from "@/lib/env";

type ImageGenResult =
  | { ok: true; imageBuffer: Buffer; mimeType: string }
  | { ok: false; error: string };

type GeminiResponse = {
  predictions?: Array<{
    bytesBase64Encoded?: string;
    mimeType?: string;
  }>;
};

const VALID_GEMINI_ASPECT_RATIOS = ["1:1", "9:16", "16:9", "3:4", "4:3", "2:3", "3:2"] as const;
type GeminiAspectRatio = (typeof VALID_GEMINI_ASPECT_RATIOS)[number];

export async function generateImageGemini(
  prompt: string,
  aspectRatioOverride?: string
): Promise<ImageGenResult> {
  if (!env.GEMINI_API_KEY) {
    return { ok: false, error: "Gemini API key not configured" };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:predict?key=${env.GEMINI_API_KEY}`;

  const isValidRatio = (v: string): v is GeminiAspectRatio =>
    (VALID_GEMINI_ASPECT_RATIOS as readonly string[]).includes(v);

  const aspectRatio: GeminiAspectRatio =
    aspectRatioOverride && isValidRatio(aspectRatioOverride)
      ? aspectRatioOverride
      : "1:1";

  const body = {
    instances: [{ prompt }],
    parameters: { sampleCount: 1, aspectRatio },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: `Gemini API error ${res.status}: ${text.slice(0, 200)}` };
  }

  const data = (await res.json()) as GeminiResponse;
  const prediction = data.predictions?.[0];
  if (!prediction?.bytesBase64Encoded) {
    return { ok: false, error: "No image data in Gemini response" };
  }

  const buffer = Buffer.from(prediction.bytesBase64Encoded, "base64");
  return { ok: true, imageBuffer: buffer, mimeType: prediction.mimeType ?? "image/png" };
}
