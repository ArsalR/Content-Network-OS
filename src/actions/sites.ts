"use server";

import { db } from "@/lib/db";
import { sites } from "@/db/schema";
import { encrypt, decrypt } from "@/lib/crypto";
import { testConnection } from "@/lib/cms-client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";

const SiteInput = z.object({
  name: z.string().min(1),
  hostname: z.string().min(1),
  apiBaseUrl: z.string().url(),
  apiKey: z.string().min(1),
  // CMS dialect. Defaults to "wordpress" so existing forms that don't yet
  // submit a kind field keep working unchanged.
  kind: z.enum(["wordpress", "pinterest-cms"]).optional().default("wordpress"),
  defaultCategory: z.string().optional(),
  defaultTone: z.string().optional(),
  notes: z.string().optional(),
  imageProvider: z.enum(["dalle", "gemini"]).optional().default("dalle"),
  imageStyle: z.string().optional(),
  // Pinterest-optimized generation settings (all optional, backward compatible)
  pinterestMode: z.boolean().optional().default(false),
  pinterestCoverPromptExtra: z.string().optional(),
  pinterestSectionPromptExtra: z.string().optional(),
  pinterestContentStyle: z.string().optional(),
  pinterestImageSize: z.string().optional().default("1000x1500"),
});

export async function createSite(
  formData: FormData
): Promise<{ ok: true; data: { id: string } } | { ok: false; error: string }> {
  const parsed = SiteInput.safeParse({
    name: formData.get("name"),
    hostname: formData.get("hostname"),
    apiBaseUrl: formData.get("apiBaseUrl"),
    apiKey: formData.get("apiKey"),
    kind: formData.get("kind") || undefined,
    defaultCategory: formData.get("defaultCategory") || undefined,
    defaultTone: formData.get("defaultTone") || undefined,
    notes: formData.get("notes") || undefined,
    imageProvider: formData.get("imageProvider") || undefined,
    imageStyle: formData.get("imageStyle") || undefined,
    pinterestMode: formData.get("pinterestMode") === "true",
    pinterestCoverPromptExtra: formData.get("pinterestCoverPromptExtra") || undefined,
    pinterestSectionPromptExtra: formData.get("pinterestSectionPromptExtra") || undefined,
    pinterestContentStyle: formData.get("pinterestContentStyle") || undefined,
    pinterestImageSize: formData.get("pinterestImageSize") || undefined,
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  try {
    const [site] = await db
      .insert(sites)
      .values({
        ...parsed.data,
        apiKey: encrypt(parsed.data.apiKey),
      })
      .returning({ id: sites.id });

    revalidatePath("/sites");
    return { ok: true, data: { id: site!.id } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to create site" };
  }
}

export async function updateSite(
  id: string,
  formData: FormData
): Promise<{ ok: true; data: { id: string } } | { ok: false; error: string }> {
  const rawApiKey = formData.get("apiKey");
  const updateSchema = SiteInput.omit({ apiKey: true }).extend({
    apiKey: z.string().optional(),
  });

  const parsed = updateSchema.safeParse({
    name: formData.get("name"),
    hostname: formData.get("hostname"),
    apiBaseUrl: formData.get("apiBaseUrl"),
    apiKey: rawApiKey && rawApiKey !== "" ? rawApiKey : undefined,
    kind: formData.get("kind") || undefined,
    defaultCategory: formData.get("defaultCategory") || undefined,
    defaultTone: formData.get("defaultTone") || undefined,
    notes: formData.get("notes") || undefined,
    imageProvider: formData.get("imageProvider") || undefined,
    imageStyle: formData.get("imageStyle") || undefined,
    pinterestMode: formData.get("pinterestMode") === "true",
    pinterestCoverPromptExtra: formData.get("pinterestCoverPromptExtra") || undefined,
    pinterestSectionPromptExtra: formData.get("pinterestSectionPromptExtra") || undefined,
    pinterestContentStyle: formData.get("pinterestContentStyle") || undefined,
    pinterestImageSize: formData.get("pinterestImageSize") || undefined,
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  try {
    const updateValues: Partial<typeof parsed.data & { apiKey: string; updatedAt: Date }> = {
      ...parsed.data,
      updatedAt: new Date(),
    };

    if (parsed.data.apiKey) {
      updateValues.apiKey = encrypt(parsed.data.apiKey);
    } else {
      delete updateValues.apiKey;
    }

    await db.update(sites).set(updateValues).where(eq(sites.id, id));

    revalidatePath("/sites");
    revalidatePath(`/sites/${id}`);
    return { ok: true, data: { id } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to update site" };
  }
}

export async function deleteSite(
  id: string
): Promise<{ ok: true; data: null } | { ok: false; error: string }> {
  try {
    await db.delete(sites).where(eq(sites.id, id));
    revalidatePath("/sites");
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to delete site" };
  }
}

export async function pauseSite(
  id: string
): Promise<{ ok: true; data: null } | { ok: false; error: string }> {
  try {
    await db.update(sites).set({ status: "paused", updatedAt: new Date() }).where(eq(sites.id, id));
    revalidatePath("/sites");
    revalidatePath(`/sites/${id}`);
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to pause site" };
  }
}

export async function resumeSite(
  id: string
): Promise<{ ok: true; data: null } | { ok: false; error: string }> {
  try {
    await db.update(sites).set({ status: "active", updatedAt: new Date() }).where(eq(sites.id, id));
    revalidatePath("/sites");
    revalidatePath(`/sites/${id}`);
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to resume site" };
  }
}

export async function testSiteConnection(
  id: string
): Promise<{ ok: true; data: { name: string } } | { ok: false; error: string }> {
  try {
    const site = await db.query.sites.findFirst({ where: eq(sites.id, id) });
    if (!site) return { ok: false, error: "Site not found" };

    const apiKey = decrypt(site.apiKey);
    const result = await testConnection(site.apiBaseUrl, apiKey, site.kind);

    if (!result.ok) {
      await db.update(sites).set({ status: "error", updatedAt: new Date() }).where(eq(sites.id, id));
      revalidatePath("/sites");
      return { ok: false, error: result.error };
    }

    await db.update(sites).set({ status: "active", updatedAt: new Date() }).where(eq(sites.id, id));
    revalidatePath("/sites");

    const name = result.data?.name ?? site.name;
    return { ok: true, data: { name } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Connection test failed" };
  }
}
