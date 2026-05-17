"use server";

import { db } from "@/lib/db";
import { keywords } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";

const ALLOWED_FIELDS = [
  "keyword",
  "searchVolume",
  "difficulty",
  "intent",
  "cluster",
  "status",
  "notes",
] as const;

type AllowedField = (typeof ALLOWED_FIELDS)[number];

export async function createKeyword(
  projectId: string,
  formData: FormData
): Promise<{ ok: true; data: { id: string } } | { ok: false; error: string }> {
  const keyword = (formData.get("keyword") as string | null)?.trim();
  if (!keyword) return { ok: false, error: "Keyword is required" };

  try {
    const [row] = await db
      .insert(keywords)
      .values({ projectId, keyword })
      .returning({ id: keywords.id });

    revalidatePath(`/projects/${projectId}/keywords`);
    return { ok: true, data: { id: row!.id } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to create keyword",
    };
  }
}

export async function bulkCreateKeywords(
  projectId: string,
  text: string
): Promise<{ ok: true; data: { count: number } } | { ok: false; error: string }> {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return { ok: false, error: "No keywords provided" };

  try {
    const rows = await db
      .insert(keywords)
      .values(lines.map((keyword) => ({ projectId, keyword })))
      .returning({ id: keywords.id });

    revalidatePath(`/projects/${projectId}/keywords`);
    return { ok: true, data: { count: rows.length } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to create keywords",
    };
  }
}

export async function updateKeyword(
  id: string,
  field: string,
  value: string | number | null
): Promise<{ ok: true; data: null } | { ok: false; error: string }> {
  if (!(ALLOWED_FIELDS as readonly string[]).includes(field)) {
    return { ok: false, error: `Field "${field}" is not allowed` };
  }

  const allowedField = field as AllowedField;

  let coerced: string | number | null = value;
  if (allowedField === "searchVolume" || allowedField === "difficulty") {
    coerced = value === null || value === "" ? null : Number(value);
  }

  try {
    await db
      .update(keywords)
      .set({ [allowedField]: coerced })
      .where(eq(keywords.id, id));

    const row = await db.query.keywords.findFirst({
      where: eq(keywords.id, id),
      columns: { projectId: true },
    });

    if (row) revalidatePath(`/projects/${row.projectId}/keywords`);
    return { ok: true, data: null };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to update keyword",
    };
  }
}

export async function deleteKeyword(
  id: string
): Promise<{ ok: true; data: null } | { ok: false; error: string }> {
  try {
    const row = await db.query.keywords.findFirst({
      where: eq(keywords.id, id),
      columns: { projectId: true },
    });

    await db.delete(keywords).where(eq(keywords.id, id));

    if (row) revalidatePath(`/projects/${row.projectId}/keywords`);
    return { ok: true, data: null };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to delete keyword",
    };
  }
}

export async function bulkDeleteKeywords(
  ids: string[]
): Promise<{ ok: true; data: null } | { ok: false; error: string }> {
  if (ids.length === 0) return { ok: false, error: "No IDs provided" };

  try {
    const rows = await db.query.keywords.findMany({
      where: inArray(keywords.id, ids),
      columns: { projectId: true },
    });

    await db.delete(keywords).where(inArray(keywords.id, ids));

    const projectIds = [...new Set(rows.map((r) => r.projectId))];
    for (const pid of projectIds) {
      revalidatePath(`/projects/${pid}/keywords`);
    }
    return { ok: true, data: null };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to delete keywords",
    };
  }
}

export async function bulkAssignCluster(
  ids: string[],
  cluster: string
): Promise<{ ok: true; data: null } | { ok: false; error: string }> {
  if (ids.length === 0) return { ok: false, error: "No IDs provided" };

  try {
    const rows = await db.query.keywords.findMany({
      where: inArray(keywords.id, ids),
      columns: { projectId: true },
    });

    await db
      .update(keywords)
      .set({ cluster: cluster || null })
      .where(inArray(keywords.id, ids));

    const projectIds = [...new Set(rows.map((r) => r.projectId))];
    for (const pid of projectIds) {
      revalidatePath(`/projects/${pid}/keywords`);
    }
    return { ok: true, data: null };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to assign cluster",
    };
  }
}

export async function bulkUpdateStatus(
  ids: string[],
  status: string
): Promise<{ ok: true; data: null } | { ok: false; error: string }> {
  if (ids.length === 0) return { ok: false, error: "No IDs provided" };

  const validStatuses = ["new", "briefed", "generated", "published", "skipped"];
  if (!validStatuses.includes(status)) {
    return { ok: false, error: "Invalid status" };
  }

  try {
    const rows = await db.query.keywords.findMany({
      where: inArray(keywords.id, ids),
      columns: { projectId: true },
    });

    await db
      .update(keywords)
      .set({
        status: status as
          | "new"
          | "briefed"
          | "generated"
          | "published"
          | "skipped",
      })
      .where(inArray(keywords.id, ids));

    const projectIds = [...new Set(rows.map((r) => r.projectId))];
    for (const pid of projectIds) {
      revalidatePath(`/projects/${pid}/keywords`);
    }
    return { ok: true, data: null };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to update status",
    };
  }
}
