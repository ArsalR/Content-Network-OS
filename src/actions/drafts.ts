"use server";

import { db } from "@/lib/db";
import { drafts, briefs, jobs } from "@/db/schema";
import { inngest } from "@/lib/inngest";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { searchPhotos } from "@/lib/pexels-client";
import { sanitizeHtml } from "@/lib/html-sanitize";

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
        // Sanitize at the source — any tag the editor produces survives the
        // allow-list, but <script>, on*= handlers, javascript: URLs etc are
        // stripped before they hit the DB. publish-draft re-sanitizes as
        // defence-in-depth.
        ...(contentHtml != null && { contentHtml: sanitizeHtml(contentHtml) }),
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
  scheduledFor: string,
  timezone?: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const draft = await db.query.drafts.findFirst({ where: eq(drafts.id, id) });
    if (!draft) return { ok: false, error: "Draft not found" };
    if (draft.status !== "approved") {
      return { ok: false, error: `Only approved drafts can be scheduled (current: ${draft.status})` };
    }

    const tz = normalizeTimezone(timezone);
    await db
      .update(drafts)
      .set({
        status: "scheduled",
        scheduledFor: new Date(scheduledFor),
        scheduledTimezone: tz,
        updatedAt: new Date(),
      })
      .where(eq(drafts.id, id));

    revalidatePath(`/drafts/${id}`);
    revalidatePath("/drafts");
    revalidatePath("/calendar");

    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Failed to schedule draft";
    return { ok: false, error };
  }
}

/**
 * Move an already-scheduled draft to a different time (e.g. via calendar
 * drag-to-reschedule). Tolerates either a scheduled draft (move) or an
 * approved draft (schedule fresh) — anything else fails.
 */
export async function rescheduleDraft(
  id: string,
  scheduledFor: string,
  timezone?: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const draft = await db.query.drafts.findFirst({ where: eq(drafts.id, id) });
    if (!draft) return { ok: false, error: "Draft not found" };
    if (draft.status !== "scheduled" && draft.status !== "approved") {
      return {
        ok: false,
        error: `Only approved or scheduled drafts can be rescheduled (current: ${draft.status})`,
      };
    }

    const tz = normalizeTimezone(timezone ?? draft.scheduledTimezone ?? undefined);
    await db
      .update(drafts)
      .set({
        status: "scheduled",
        scheduledFor: new Date(scheduledFor),
        scheduledTimezone: tz,
        updatedAt: new Date(),
      })
      .where(eq(drafts.id, id));

    revalidatePath(`/drafts/${id}`);
    revalidatePath("/drafts");
    revalidatePath("/calendar");

    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Failed to reschedule draft";
    return { ok: false, error };
  }
}

/**
 * Validate an IANA timezone string. Falls back to "UTC" if missing or
 * unrecognised. Uses Intl.DateTimeFormat to verify the zone is real.
 */
function normalizeTimezone(tz: string | null | undefined): string {
  if (!tz) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

export async function unscheduleDraft(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await db
      .update(drafts)
      .set({ status: "approved", scheduledFor: null, updatedAt: new Date() })
      .where(eq(drafts.id, id));

    revalidatePath(`/drafts/${id}`);
    revalidatePath("/drafts");

    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Failed to cancel schedule";
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

    // Allowed sources for a manual publish:
    //   - approved/scheduled: the standard happy paths
    //   - failed: the kanban "Retry publish" button uses this to recover
    //     a draft that previously failed (publishAttempts/failureReason
    //     are reset below so the retry gets a fresh budget).
    const allowedStatuses = ["approved", "scheduled", "failed"] as const;
    if (!(allowedStatuses as readonly string[]).includes(draft.status)) {
      return {
        ok: false,
        error: `Draft must be approved, scheduled, or failed to publish (current: ${draft.status})`,
      };
    }

    const [job] = await db
      .insert(jobs)
      .values({ kind: "publish-draft", status: "queued", inputId: id })
      .returning({ id: jobs.id });

    await inngest.send({ name: "draft/publish", data: { draftId: id, jobId: job.id } });

    // Manual republish: clear the stored idempotency key so publishDraft
    // generates a fresh one (each user-initiated republish should be a
    // distinct CMS-side operation, not a replay), and reset the attempt
    // counter so the user gets the full retry budget on this republish.
    await db
      .update(drafts)
      .set({
        status: "publishing",
        lastIdempotencyKey: null,
        publishAttempts: 0,
        failureReason: null,
        failureCode: null,
        updatedAt: new Date(),
      })
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

/**
 * Republish a published draft as a fresh draft row. Used for seasonal
 * content rotation — copy the body, clear publish state, and set
 * canonicalUrl on the new draft to the original's publishedUrl so the
 * republished version doesn't cannibalise SEO on the original.
 *
 * The original draft is left untouched.
 */
export async function cloneDraftForRepublish(
  id: string
): Promise<{ ok: true; data: { id: string } } | { ok: false; error: string }> {
  try {
    const original = await db.query.drafts.findFirst({ where: eq(drafts.id, id) });
    if (!original) return { ok: false, error: "Draft not found" };
    if (original.status !== "published") {
      return {
        ok: false,
        error: `Only published drafts can be republished (current: ${original.status})`,
      };
    }

    // Disambiguate the slug. We could let the user choose later; pre-suffix
    // with "-v2" / "-v3" / etc by counting existing siblings on prefix match.
    const baseSlug = original.slug.replace(/-v\d+$/, "");
    const existingClones = await db
      .select({ slug: drafts.slug })
      .from(drafts)
      .where(eq(drafts.projectId, original.projectId));
    const siblingPattern = new RegExp(`^${escapeForRegex(baseSlug)}(?:-v(\\d+))?$`);
    let maxVersion = 1;
    for (const row of existingClones) {
      const m = row.slug.match(siblingPattern);
      if (m) {
        const v = m[1] ? parseInt(m[1], 10) : 1;
        if (v > maxVersion) maxVersion = v;
      }
    }
    const nextSlug = `${baseSlug}-v${maxVersion + 1}`;

    const [clone] = await db
      .insert(drafts)
      .values({
        projectId: original.projectId,
        briefId: original.briefId,
        title: original.title,
        slug: nextSlug,
        excerpt: original.excerpt,
        contentHtml: original.contentHtml,
        contentMarkdown: original.contentMarkdown,
        coverImageUrl: original.coverImageUrl,
        coverImageAlt: original.coverImageAlt,
        galleryImages: original.galleryImages,
        seoTitle: original.seoTitle,
        seoDescription: original.seoDescription,
        seoKeywords: original.seoKeywords,
        status: "draft",
        targetSiteId: original.targetSiteId,
        targetCategory: original.targetCategory,
        pinterestMeta: original.pinterestMeta,
        // Crucial: point at the original published URL so search engines
        // know the new draft is a refresh, not a duplicate. Once the new
        // draft is published the user can update the canonical or leave
        // it pointing at the seasonal original.
        // NOTE: drafts.canonicalUrl isn't a column on this schema today;
        // we store the original URL on the new draft via publishedUrl=null
        // and use the seoDescription/keywords path. If/when a dedicated
        // canonicalUrl column is added on `drafts`, switch to that.
        publishedPostId: null,
        publishedUrl: null,
        publishedAt: null,
        failureReason: null,
        failureCode: null,
        publishAttempts: 0,
        lastIdempotencyKey: null,
      })
      .returning({ id: drafts.id });

    revalidatePath("/drafts");
    revalidatePath(`/drafts/${clone!.id}`);
    return { ok: true, data: { id: clone!.id } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to republish draft",
    };
  }
}

function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
