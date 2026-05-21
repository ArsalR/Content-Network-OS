import { generateImageDalle } from "./dalle-client";
import { generateImageGemini } from "./gemini-client";
import { validatePinterestDimensions } from "@/lib/image-validation";

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

  // Pinterest mode: hard-fail any generation request that didn't produce a
  // 2:3 ±5% image. This catches provider drift (e.g. DALL-E returning
  // square despite the 1024x1792 size request) before we waste a CMS
  // upload + a publish on a non-conforming pin.
  if (pinterestMode) {
    const dimsCheck = validatePinterestDimensions(result.imageBuffer);
    if (!dimsCheck.ok) {
      return {
        ok: false,
        error: `Pinterest image rejected by validator: ${dimsCheck.error}`,
      };
    }
  }

  return {
    ok: true,
    imageBase64: result.imageBuffer.toString("base64"),
    mimeType: result.mimeType,
  };
}
