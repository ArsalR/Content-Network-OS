"use server";

import { db } from "@/lib/db";
import { promptTemplates } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

export async function createPromptTemplate(
  formData: FormData
): Promise<{ ok: true; data: { id: string } } | { ok: false; error: string }> {
  const name = (formData.get("name") as string | null)?.trim();
  const kind = (formData.get("kind") as string | null)?.trim();
  const template = (formData.get("template") as string | null)?.trim();
  const isDefault = formData.get("isDefault") === "true";

  if (!name) return { ok: false, error: "Name is required" };
  if (!kind) return { ok: false, error: "Kind is required" };
  if (!template) return { ok: false, error: "Template is required" };

  const validKinds = ["outline", "draft", "image_prompt", "social_caption"];
  if (!validKinds.includes(kind)) return { ok: false, error: "Invalid kind" };

  try {
    const [row] = await db
      .insert(promptTemplates)
      .values({
        name,
        kind: kind as "outline" | "draft" | "image_prompt" | "social_caption",
        template,
        isDefault,
      })
      .returning({ id: promptTemplates.id });

    revalidatePath("/settings/prompts");
    return { ok: true, data: { id: row!.id } };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Failed to create prompt template",
    };
  }
}

export async function updatePromptTemplate(
  id: string,
  formData: FormData
): Promise<{ ok: true; data: null } | { ok: false; error: string }> {
  const name = (formData.get("name") as string | null)?.trim();
  const kind = (formData.get("kind") as string | null)?.trim();
  const template = (formData.get("template") as string | null)?.trim();
  const isDefault = formData.get("isDefault") === "true";

  if (!name) return { ok: false, error: "Name is required" };
  if (!kind) return { ok: false, error: "Kind is required" };
  if (!template) return { ok: false, error: "Template is required" };

  const validKinds = ["outline", "draft", "image_prompt", "social_caption"];
  if (!validKinds.includes(kind)) return { ok: false, error: "Invalid kind" };

  try {
    await db
      .update(promptTemplates)
      .set({
        name,
        kind: kind as "outline" | "draft" | "image_prompt" | "social_caption",
        template,
        isDefault,
        updatedAt: new Date(),
      })
      .where(eq(promptTemplates.id, id));

    revalidatePath("/settings/prompts");
    return { ok: true, data: null };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Failed to update prompt template",
    };
  }
}

export async function deletePromptTemplate(
  id: string
): Promise<{ ok: true; data: null } | { ok: false; error: string }> {
  try {
    await db.delete(promptTemplates).where(eq(promptTemplates.id, id));
    revalidatePath("/settings/prompts");
    return { ok: true, data: null };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Failed to delete prompt template",
    };
  }
}
