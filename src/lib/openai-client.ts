import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { db } from "@/lib/db";
import { apiCalls } from "@/db/schema";
import { computeCostUsd, getDefaultModel } from "@/lib/pricing";
import { env } from "@/lib/env";

type GenerateResult =
  | {
      ok: true;
      text: string;
      tokensIn: number;
      tokensOut: number;
      costUsd: number;
      model: string;
    }
  | { ok: false; error: string };

export async function generate(
  prompt: string,
  options?: {
    model?: string;
    driverId?: string;
    systemPrompt?: string;
  }
): Promise<GenerateResult> {
  if (!env.OPENAI_API_KEY) {
    return { ok: false, error: "OpenAI API key not configured" };
  }

  const modelName = options?.model ?? getDefaultModel();
  const driverId = options?.driverId ?? null;
  const systemPrompt = options?.systemPrompt;

  const openaiProvider = createOpenAI({ apiKey: env.OPENAI_API_KEY });

  const startedAt = Date.now();

  try {
    const result = await generateText({
      model: openaiProvider(modelName),
      messages: [
        ...(systemPrompt
          ? [{ role: "system" as const, content: systemPrompt }]
          : []),
        { role: "user" as const, content: prompt },
      ],
      providerOptions: {
        openai: { response_format: { type: "json_object" } },
      },
    });

    const durationMs = Date.now() - startedAt;
    const tokensIn = result.usage.inputTokens ?? 0;
    const tokensOut = result.usage.outputTokens ?? 0;
    const costUsd = computeCostUsd(modelName, tokensIn, tokensOut);

    await db.insert(apiCalls).values({
      kind: "openai",
      driverId: driverId,
      status: "success",
      durationMs,
      costUsd: costUsd.toFixed(4),
      tokensIn,
      tokensOut,
    });

    return { ok: true, text: result.text, tokensIn, tokensOut, costUsd, model: modelName };
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const errorMessage = err instanceof Error ? err.message : "Unknown error";

    await db.insert(apiCalls).values({
      kind: "openai",
      driverId: driverId,
      status: "error",
      durationMs,
      costUsd: "0",
      errorMessage,
    });

    return { ok: false, error: errorMessage };
  }
}
