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
  stylePrefix?: string
): Promise<ImageGenResultSerializable> {
  const fullPrompt = stylePrefix ? `${stylePrefix} ${prompt}` : prompt;
  const result: ImageGenResult =
    provider === "gemini"
      ? await generateImageGemini(fullPrompt)
      : await generateImageDalle(fullPrompt);

  if (!result.ok) return result;
  return {
    ok: true,
    imageBase64: result.imageBuffer.toString("base64"),
    mimeType: result.mimeType,
  };
}
