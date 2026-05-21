import { inngest } from "@/lib/inngest";
import { db } from "@/lib/db";
import { drafts, sites, jobs } from "@/db/schema";
import { decrypt } from "@/lib/crypto";
import * as cmsClient from "@/lib/cms-client";
import type {
  NormalizedPostInput,
  SiteContext,
} from "@/lib/cms-client";
import { eq } from "drizzle-orm";

type GalleryImageInput = {
  url: string;
  alt?: string | null;
  caption?: string | null;
  order?: number;
};

/**
 * If `imageUrl` is already hosted on the target CMS hostname we keep it.
 * Otherwise download it and re-upload via the dialect-aware client so it
 * lives on the target CMS's CDN.
 */
async function reuploadImageIfNeeded(
  imageUrl: string,
  siteCtx: SiteContext,
  siteHostname: string,
  alt?: string
): Promise<string> {
  if (imageUrl.includes(siteHostname)) {
    return imageUrl;
  }

  const res = await fetch(imageUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch image ${imageUrl}: ${res.status}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const contentType = res.headers.get("content-type") ?? "image/jpeg";
  const extension = contentType.split("/")[1]?.split(";")[0] ?? "jpg";
  const filename = `cnos-image-${Date.now()}.${extension}`;

  const uploadResult = await cmsClient.uploadFile(
    siteCtx,
    buffer,
    filename,
    contentType,
    alt
  );
  if (!uploadResult.ok) {
    throw new Error(`Failed to upload image: ${uploadResult.error}`);
  }
  return uploadResult.data.url;
}

export const publishDraft = inngest.createFunction(
  {
    id: "publish-draft",
    name: "Publish Draft",
    triggers: [{ event: "draft/publish" }],
  },
  async ({ event, step }) => {
    const { draftId, jobId } = event.data as { draftId: string; jobId: string };

    // 1. Mark job as running, set draft status to 'publishing'
    await step.run("mark-running", async () => {
      await db
        .update(jobs)
        .set({ status: "running", startedAt: new Date() })
        .where(eq(jobs.id, jobId));

      await db
        .update(drafts)
        .set({ status: "publishing", updatedAt: new Date() })
        .where(eq(drafts.id, draftId));
    });

    try {
      // 2. Load draft from DB
      const draft = await step.run("load-draft", async () => {
        return db.query.drafts.findFirst({ where: eq(drafts.id, draftId) });
      });

      if (!draft) throw new Error(`Draft ${draftId} not found`);
      if (!draft.targetSiteId) throw new Error("Draft has no target site");

      // 3. Load target site
      const site = await step.run("load-site", async () => {
        return db.query.sites.findFirst({ where: eq(sites.id, draft.targetSiteId!) });
      });

      if (!site) throw new Error(`Site ${draft.targetSiteId} not found`);

      const decryptedApiKey = decrypt(site.apiKey);
      const siteCtx: SiteContext = {
        apiBaseUrl: site.apiBaseUrl,
        apiKey: decryptedApiKey,
        kind: site.kind,
      };

      // 4. Re-upload cover image if it's not already on the target CMS host
      let finalCoverImageUrl: string | null = draft.coverImageUrl ?? null;

      if (finalCoverImageUrl) {
        finalCoverImageUrl = await step.run("reupload-cover-image", async () => {
          return reuploadImageIfNeeded(
            draft.coverImageUrl!,
            siteCtx,
            site.hostname,
            draft.coverImageAlt ?? draft.title
          );
        });

        if (finalCoverImageUrl !== draft.coverImageUrl) {
          await step.run("update-cover-url", async () => {
            await db
              .update(drafts)
              .set({ coverImageUrl: finalCoverImageUrl, updatedAt: new Date() })
              .where(eq(drafts.id, draftId));
          });
        }
      }

      // 5. Re-upload any gallery images that aren't on the target host.
      // (Previously these were silently dropped.)
      const rawGallery: GalleryImageInput[] = Array.isArray(draft.galleryImages)
        ? (draft.galleryImages as GalleryImageInput[])
        : [];

      const galleryImages: GalleryImageInput[] = [];
      for (let i = 0; i < rawGallery.length; i++) {
        const g = rawGallery[i];
        if (!g?.url) continue;

        const finalUrl = await step.run(`reupload-gallery-${i}`, async () => {
          return reuploadImageIfNeeded(g.url, siteCtx, site.hostname, g.alt ?? undefined);
        });

        galleryImages.push({
          url: finalUrl,
          alt: g.alt ?? draft.title,
          caption: g.caption ?? null,
          order: typeof g.order === "number" ? g.order : i,
        });
      }

      // 6. Build normalized post payload (dialect-agnostic).
      const normalized: NormalizedPostInput = {
        title: draft.title,
        slug: draft.slug,
        contentHtml: draft.contentHtml,
        excerpt: draft.excerpt,
        coverImageUrl: finalCoverImageUrl,
        coverImageAlt: draft.coverImageAlt,
        galleryImages,
        seoTitle: draft.seoTitle,
        seoDescription: draft.seoDescription,
        seoKeywords: draft.seoKeywords,
        targetCategory: draft.targetCategory ?? site.defaultCategory,
        // OG/Twitter defaults are filled in by the dialect adapter when null.
        ogImage: finalCoverImageUrl,
      };

      // 7. Create the post via the dialect-aware client.
      const postResult = await step.run("create-post", async () => {
        return cmsClient.createPost(siteCtx, normalized);
      });

      if (!postResult.ok) {
        throw new Error(postResult.error);
      }

      const { id: publishedPostId, url: publishedUrl, slug: canonicalSlug } = postResult.data;

      // 8. On success: persist publishedPostId/Url/At AND the CMS-canonical slug
      // (the CMS may have auto-suffixed on collision, e.g. "foo" → "foo-2").
      await step.run("mark-published", async () => {
        await db
          .update(drafts)
          .set({
            status: "published",
            publishedPostId,
            publishedUrl,
            publishedAt: new Date(),
            // Only overwrite our slug when the CMS gave us a non-empty one.
            ...(canonicalSlug ? { slug: canonicalSlug } : {}),
            updatedAt: new Date(),
          })
          .where(eq(drafts.id, draftId));

        await db
          .update(jobs)
          .set({ status: "completed", completedAt: new Date() })
          .where(eq(jobs.id, jobId));
      });

      return { publishedPostId, publishedUrl, slug: canonicalSlug };
    } catch (err) {
      const failureReason = err instanceof Error ? err.message : "Unknown error";

      await step.run("mark-failed", async () => {
        await db
          .update(drafts)
          .set({ status: "failed", failureReason, updatedAt: new Date() })
          .where(eq(drafts.id, draftId));

        await db
          .update(jobs)
          .set({ status: "failed", errorMessage: failureReason, completedAt: new Date() })
          .where(eq(jobs.id, jobId));
      });

      throw err;
    }
  }
);
