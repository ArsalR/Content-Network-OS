import { generateImageDalle } from "./dalle-client";
import { generateImageGemini } from "./gemini-client";

export type ImageGenResult =
  | { ok: true; imageBuffer: Buffer; mimeType: string }
  | { ok: false; error: string };

export type ImageGenResultSerializable =
  | { ok: true; imageBase64: string; mimeType: string }
  | { ok: false; error: string };

export async function generateImage(
  prompt: string,
  provider: "dalle" | "gemini",
  stylePrefix?: string,
  pinterestMode?: boolean
): Promise<ImageGenResultSerializable> {
  const fullPrompt = stylePrefix ? `${stylePrefix} ${prompt}` : prompt;

  // Pinterest images are vertical 2:3 ratio. DALL-E 3 supports 1024x1792 as
  // the closest vertical size; Gemini Imagen supports a "2:3" aspect ratio.
  const dalleSize = pinterestMode ? "1024x1792" : undefined;
  const geminiRatio = pinterestMode ? "2:3" : undefined;

  const result: ImageGenResult =
    provider === "gemini"
      ? await generateImageGemini(fullPrompt, geminiRatio)
      : await generateImageDalle(fullPrompt, dalleSize);

  if (!result.ok) return result;
  return {
    ok: true,
    imageBase64: result.imageBuffer.toString("base64"),
    mimeType: result.mimeType,
  };
}
