"use server";

import { db } from "@/lib/db";
import { drafts, briefs, jobs } from "@/db/schema";
import { inngest } from "@/lib/inngest";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { searchPhotos } from "@/lib/pexels-client";

export async function enqueueGeneration(
  briefId: string
): Promise<{ ok: true; data: { jobId: string } } | { ok: false; error: string }> {
  try {
    // 1. Check brief exists and is 'ready'
    const brief = await db.query.briefs.findFirst({
      where: eq(briefs.id, briefId),
    });

    if (!brief) {
      return { ok: false, error: "Brief not found" };
    }

    if (brief.status !== "ready") {
      return {
        ok: false,
        error: `Brief must be in 'ready' status to generate (current: ${brief.status})`,
      };
    }

    // 2. Insert job record
    const [job] = await db
      .insert(jobs)
      .values({
        kind: "generate-draft",
        status: "queued",
        inputId: briefId,
      })
      .returning({ id: jobs.id });

    // 3. Send inngest event
    await inngest.send({
      name: "draft/generate",
      data: { briefId, jobId: job.id },
    });

    // 4. Update brief status to 'generating'
    await db
      .update(briefs)
      .set({ status: "generating", updatedAt: new Date() })
      .where(eq(briefs.id, briefId));

    revalidatePath(`/projects/${brief.projectId}/briefs`);

    // 5. Return success
    return { ok: true, data: { jobId: job.id } };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Failed to enqueue generation";
    return { ok: false, error };
  }
}

export async function updateDraft(
  id: string,
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const title = formData.get("title") as string | null;
    const slug = formData.get("slug") as string | null;
    const excerpt = formData.get("excerpt") as string | null;
    const contentHtml = formData.get("contentHtml") as string | null;
    const seoTitle = formData.get("seoTitle") as string | null;
    const seoDescription = formData.get("seoDescription") as string | null;
    const seoKeywords = formData.get("seoKeywords") as string | null;
    const coverImageUrl = formData.get("coverImageUrl") as string | null;
    const coverImageAlt = formData.get("coverImageAlt") as string | null;
    const targetSiteId = formData.get("targetSiteId") as string | null;
    const targetCategory = formData.get("targetCategory") as string | null;
    const scheduledForRaw = formData.get("scheduledFor") as string | null;

    const scheduledFor =
      scheduledForRaw && scheduledForRaw.trim() !== ""
        ? new Date(scheduledForRaw)
        : undefined;

    await db
      .update(drafts)
      .set({
        ...(title != null && { title }),
        ...(slug != null && { slug }),
        ...(excerpt != null && { excerpt }),
        ...(contentHtml != null && { contentHtml }),
        ...(seoTitle != null && { seoTitle }),
        ...(seoDescription != null && { seoDescription }),
        ...(seoKeywords != null && { seoKeywords }),
        ...(coverImageUrl != null && { coverImageUrl }),
        ...(coverImageAlt != null && { coverImageAlt }),
        ...(targetSiteId != null && { targetSiteId: targetSiteId || null }),
        ...(targetCategory != null && { targetCategory }),
        ...(scheduledFor !== undefined && { scheduledFor }),
        updatedAt: new Date(),
      })
      .where(eq(drafts.id, id));

    revalidatePath(`/drafts/${id}`);
    revalidatePath("/drafts");

    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Failed to update draft";
    return { ok: false, error };
  }
}

export async function approveDraft(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await db
      .update(drafts)
      .set({ status: "approved", updatedAt: new Date() })
      .where(eq(drafts.id, id));

    revalidatePath(`/drafts/${id}`);
    revalidatePath("/drafts");

    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Failed to approve draft";
    return { ok: false, error };
  }
}

export async function rejectDraft(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await db
      .update(drafts)
      .set({ status: "draft", updatedAt: new Date() })
      .where(eq(drafts.id, id));

    revalidatePath(`/drafts/${id}`);
    revalidatePath("/drafts");

    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Failed to reject draft";
    return { ok: false, error };
  }
}

export async function scheduleDraft(
  id: string,
  scheduledFor: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await db
      .update(drafts)
      .set({
        status: "scheduled",
        scheduledFor: new Date(scheduledFor),
        updatedAt: new Date(),
      })
      .where(eq(drafts.id, id));

    revalidatePath(`/drafts/${id}`);
    revalidatePath("/drafts");

    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Failed to schedule draft";
    return { ok: false, error };
  }
}

export async function publishDraftNow(
  id: string
): Promise<{ ok: true; data: { jobId: string } } | { ok: false; error: string }> {
  try {
    const draft = await db.query.drafts.findFirst({ where: eq(drafts.id, id) });
    if (!draft) return { ok: false, error: "Draft not found" };
    if (!draft.targetSiteId) return { ok: false, error: "Draft has no target site assigned" };

    const allowedStatuses = ["approved", "scheduled"] as const;
    if (!(allowedStatuses as readonly string[]).includes(draft.status)) {
      return {
        ok: false,
        error: `Draft must be approved or scheduled to publish (current: ${draft.status})`,
      };
    }

    const [job] = await db
      .insert(jobs)
      .values({ kind: "publish-draft", status: "queued", inputId: id })
      .returning({ id: jobs.id });

    await inngest.send({ name: "draft/publish", data: { draftId: id, jobId: job.id } });

    await db
      .update(drafts)
      .set({ status: "publishing", updatedAt: new Date() })
      .where(eq(drafts.id, id));

    revalidatePath(`/drafts/${id}`);
    revalidatePath("/drafts");

    return { ok: true, data: { jobId: job.id } };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Failed to publish draft";
    return { ok: false, error };
  }
}

export async function moveDraftToReview(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await db
      .update(drafts)
      .set({ status: "review", updatedAt: new Date() })
      .where(eq(drafts.id, id));

    revalidatePath(`/drafts/${id}`);
    revalidatePath("/drafts");

    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Failed to move draft to review";
    return { ok: false, error };
  }
}

export async function searchPexelsPhotos(
  query: string
): Promise<
  | { ok: true; data: { photos: Array<{ url: string; thumb: string; photographer: string }> } }
  | { ok: false; error: string }
> {
  try {
    const result = await searchPhotos(query, 12);
    if (!result.ok) return { ok: false, error: result.error };

    const photos = result.photos.map((p) => ({
      url: p.src.large,
      thumb: p.src.medium,
      photographer: p.photographer,
    }));

    return { ok: true, data: { photos } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to search photos",
    };
  }
}
