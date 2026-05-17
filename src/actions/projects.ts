"use server";

import { db } from "@/lib/db";
import { projects } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";

const ProjectInput = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  defaultSiteId: z.string().uuid().optional(),
  defaultCategory: z.string().optional(),
  defaultWordCount: z.coerce.number().int().positive().default(1200),
  defaultTone: z.string().optional(),
});

export async function createProject(
  formData: FormData
): Promise<{ ok: true; data: { id: string } } | { ok: false; error: string }> {
  const parsed = ProjectInput.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    defaultSiteId: formData.get("defaultSiteId") || undefined,
    defaultCategory: formData.get("defaultCategory") || undefined,
    defaultWordCount: formData.get("defaultWordCount") || 1200,
    defaultTone: formData.get("defaultTone") || undefined,
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  try {
    const [project] = await db
      .insert(projects)
      .values(parsed.data)
      .returning({ id: projects.id });

    revalidatePath("/projects");
    return { ok: true, data: { id: project!.id } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to create project" };
  }
}

export async function updateProject(
  id: string,
  formData: FormData
): Promise<{ ok: true; data: { id: string } } | { ok: false; error: string }> {
  const parsed = ProjectInput.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    defaultSiteId: formData.get("defaultSiteId") || undefined,
    defaultCategory: formData.get("defaultCategory") || undefined,
    defaultWordCount: formData.get("defaultWordCount") || 1200,
    defaultTone: formData.get("defaultTone") || undefined,
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  try {
    await db
      .update(projects)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(projects.id, id));

    revalidatePath("/projects");
    revalidatePath(`/projects/${id}`);
    return { ok: true, data: { id } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to update project" };
  }
}

export async function archiveProject(
  id: string
): Promise<{ ok: true; data: null } | { ok: false; error: string }> {
  try {
    await db
      .update(projects)
      .set({ status: "archived", updatedAt: new Date() })
      .where(eq(projects.id, id));

    revalidatePath("/projects");
    revalidatePath(`/projects/${id}`);
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to archive project" };
  }
}

export async function restoreProject(
  id: string
): Promise<{ ok: true; data: null } | { ok: false; error: string }> {
  try {
    await db
      .update(projects)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(projects.id, id));

    revalidatePath("/projects");
    revalidatePath(`/projects/${id}`);
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to restore project" };
  }
}

export async function deleteProject(
  id: string
): Promise<{ ok: true; data: null } | { ok: false; error: string }> {
  try {
    await db.delete(projects).where(eq(projects.id, id));
    revalidatePath("/projects");
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to delete project" };
  }
}
