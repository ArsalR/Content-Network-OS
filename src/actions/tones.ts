"use server";

import { db } from "@/lib/db";
import { tones } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

export async function createTone(
  formData: FormData
): Promise<{ ok: true; data: { id: string } } | { ok: false; error: string }> {
  const name = (formData.get("name") as string | null)?.trim();
  const prompt = (formData.get("prompt") as string | null)?.trim();
  const description =
    (formData.get("description") as string | null)?.trim() || null;

  if (!name) return { ok: false, error: "Name is required" };
  if (!prompt) return { ok: false, error: "Prompt is required" };

  try {
    const [row] = await db
      .insert(tones)
      .values({ name, prompt, description })
      .returning({ id: tones.id });

    revalidatePath("/settings/tones");
    return { ok: true, data: { id: row!.id } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to create tone",
    };
  }
}

export async function updateTone(
  id: string,
  formData: FormData
): Promise<{ ok: true; data: null } | { ok: false; error: string }> {
  const name = (formData.get("name") as string | null)?.trim();
  const prompt = (formData.get("prompt") as string | null)?.trim();
  const description =
    (formData.get("description") as string | null)?.trim() || null;

  if (!name) return { ok: false, error: "Name is required" };
  if (!prompt) return { ok: false, error: "Prompt is required" };

  try {
    await db
      .update(tones)
      .set({ name, prompt, description })
      .where(eq(tones.id, id));

    revalidatePath("/settings/tones");
    return { ok: true, data: null };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to update tone",
    };
  }
}

export async function deleteTone(
  id: string
): Promise<{ ok: true; data: null } | { ok: false; error: string }> {
  try {
    await db.delete(tones).where(eq(tones.id, id));
    revalidatePath("/settings/tones");
    return { ok: true, data: null };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to delete tone",
    };
  }
}
