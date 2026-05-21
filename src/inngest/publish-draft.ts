import { inngest } from "@/lib/inngest";
import { db } from "@/lib/db";
import { drafts, sites, jobs } from "@/db/schema";
import { decrypt } from "@/lib/crypto";
import * as cmsClient from "@/lib/cms-client";
import type {
  NormalizedPostInput,
  SiteContext,
  PostOptions,
} from "@/lib/cms-client";
import { extractInlineImages } from "@/lib/cms-client";
import { getCapabilities } from "@/lib/cms-capabilities";
import { sanitizeHtml } from "@/lib/html-sanitize";
import { CnosCmsError } from "@/lib/cms-errors";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

const MAX_PUBLISH_ATTEMPTS = 5;

type GalleryImageInput = {
  url: string;
  alt?: string | null;
  caption?: string | null;
  order?: number;
};

/** Replace every <img src="OLD"> with <img src="NEW">, preserving other attrs. */
function rewriteImgSrc(html: string, oldUrl: string, newUrl: string): string {
  if (oldUrl === newUrl) return html;
  const escaped = oldUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `(<img\\b[^>]*\\bsrc\\s*=\\s*)(?:"${escaped}"|'${escaped}'|${escaped})`,
    "gi"
  );
  return html.replace(re, `$1"${newUrl}"`);
}

async function reuploadImageIfNeeded(
  imageUrl: string,
  siteCtx: SiteContext,
  siteHostname: string,
  alt?: string
): Promise<string> {
  if (imageUrl.includes(siteHostname)) return imageUrl;

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

    // 1. Mark job + draft running, increment publishAttempts (cap at 5).
    // Returns the new attempt count so we can bail before doing real work
    // if we've already retried 5 times.
    const attempts = await step.run("mark-running", async () => {
      await db
        .update(jobs)
        .set({ status: "running", startedAt: new Date() })
        .where(eq(jobs.id, jobId));

      const [row] = await db
        .update(drafts)
        .set({
          status: "publishing",
          // Drizzle doesn't have a direct increment helper; read-modify-write
          // is fine here since the publisher is single-threaded per draft.
          updatedAt: new Date(),
        })
        .where(eq(drafts.id, draftId))
        .returning({
          attempts: drafts.publishAttempts,
        });

      const next = (row?.attempts ?? 0) + 1;
      await db
        .update(drafts)
        .set({ publishAttempts: next })
        .where(eq(drafts.id, draftId));
      return next;
    });

    if (attempts > MAX_PUBLISH_ATTEMPTS) {
      const failureReason = `Exceeded ${MAX_PUBLISH_ATTEMPTS} publish attempts; not retrying.`;
      await step.run("mark-attempts-exceeded", async () => {
        await db
          .update(drafts)
          .set({
            status: "failed",
            failureReason,
            failureCode: "max_attempts_exceeded",
            updatedAt: new Date(),
          })
          .where(eq(drafts.id, draftId));
        await db
          .update(jobs)
          .set({ status: "failed", errorMessage: failureReason, completedAt: new Date() })
          .where(eq(jobs.id, jobId));
      });
      return { skipped: true, reason: failureReason };
    }

    try {
      // 2. Load draft + site.
      const draft = await step.run("load-draft", async () => {
        return db.query.drafts.findFirst({ where: eq(drafts.id, draftId) });
      });
      if (!draft) throw new Error(`Draft ${draftId} not found`);
      if (!draft.targetSiteId) throw new Error("Draft has no target site");

      const site = await step.run("load-site", async () => {
        return db.query.sites.findFirst({ where: eq(sites.id, draft.targetSiteId!) });
      });
      if (!site) throw new Error(`Site ${draft.targetSiteId} not found`);

      const decryptedApiKey = decrypt(site.apiKey);
      const siteCtx: SiteContext = {
        id: site.id,
        apiBaseUrl: site.apiBaseUrl,
        apiKey: decryptedApiKey,
        kind: site.kind,
      };

      // 3. Capabilities probe (cached). Gates every Phase 3 optional path.
      // `site` came from an earlier step.run so Inngest has serialized
      // any Date fields to ISO strings — re-hydrate before passing on.
      const capabilities = await step.run("load-capabilities", async () => {
        const checkedAt =
          site.capabilitiesCheckedAt
            ? new Date(site.capabilitiesCheckedAt as unknown as string | Date)
            : null;
        return getCapabilities({
          id: site.id,
          apiBaseUrl: site.apiBaseUrl,
          kind: site.kind,
          capabilitiesCache: site.capabilitiesCache,
          capabilitiesCheckedAt: checkedAt,
        });
      });

      // 4. Cover image re-upload (idempotent — already on host means no-op).
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

      // 5. Gallery + inline images.
      const rawGallery: GalleryImageInput[] = Array.isArray(draft.galleryImages)
        ? (draft.galleryImages as GalleryImageInput[])
        : [];
      const galleryImages: GalleryImageInput[] = [];
      const seenUrls = new Set<string>();

      for (let i = 0; i < rawGallery.length; i++) {
        const g = rawGallery[i];
        if (!g?.url) continue;
        const finalUrl = await step.run(`reupload-gallery-${i}`, async () => {
          return reuploadImageIfNeeded(g.url, siteCtx, site.hostname, g.alt ?? undefined);
        });
        if (seenUrls.has(finalUrl)) continue;
        seenUrls.add(finalUrl);
        galleryImages.push({
          url: finalUrl,
          alt: g.alt ?? draft.title,
          caption: g.caption ?? null,
          order: typeof g.order === "number" ? g.order : i,
        });
      }

      const inlineImages = extractInlineImages(draft.contentHtml);
      let rewrittenContentHtml = draft.contentHtml;
      for (let i = 0; i < inlineImages.length; i++) {
        const img = inlineImages[i];
        const finalUrl = await step.run(`reupload-inline-${i}`, async () => {
          return reuploadImageIfNeeded(img.url, siteCtx, site.hostname, img.alt);
        });
        if (finalUrl !== img.url) {
          rewrittenContentHtml = rewriteImgSrc(rewrittenContentHtml, img.url, finalUrl);
        }
        if (seenUrls.has(finalUrl)) continue;
        seenUrls.add(finalUrl);
        galleryImages.push({
          url: finalUrl,
          alt: img.alt ?? draft.title,
          caption: null,
          order: galleryImages.length,
        });
      }

      // 5b. Sanitize the post body before sending. (defence-in-depth — drafts
      // are already sanitized at save time in actions/drafts.ts, but a fresh
      // pass here protects against any direct DB writes elsewhere.)
      const sanitizedContentHtml = sanitizeHtml(rewrittenContentHtml);

      // 6. Build the normalized payload (dialect-agnostic).
      const normalized: NormalizedPostInput = {
        title: draft.title,
        slug: draft.slug,
        contentHtml: sanitizedContentHtml,
        excerpt: draft.excerpt,
        coverImageUrl: finalCoverImageUrl,
        coverImageAlt: draft.coverImageAlt,
        galleryImages,
        seoTitle: draft.seoTitle,
        seoDescription: draft.seoDescription,
        seoKeywords: draft.seoKeywords,
        targetCategory: draft.targetCategory ?? site.defaultCategory,
        ogImage: finalCoverImageUrl,
        publishedAt: draft.scheduledFor ?? new Date(),
      };

      // 7. Idempotency layers — hardest guarantee first.
      //
      //   Layer 1 (CMS-level, optional): if features.idempotency, send an
      //     Idempotency-Key. Reuse the stored key across retries; only
      //     regenerate if it's missing (i.e. first attempt or user clicked
      //     republish, which we model by NULL-ing lastIdempotencyKey on
      //     manual republish — see actions/drafts.ts::publishDraftNow).
      //   Layer 2 (CNOS-level, always on): if draft.publishedPostId is set,
      //     PUT instead of POST so a duplicate event doesn't create a
      //     second post.
      //   Layer 3 (slug recovery, optional): if no publishedPostId but a
      //     slug + features.slug_lookup, look up by slug and PUT if found.
      let idempotencyKey: string | undefined;
      if (capabilities.features.idempotency) {
        idempotencyKey = draft.lastIdempotencyKey ?? randomUUID();
        if (idempotencyKey !== draft.lastIdempotencyKey) {
          await step.run("persist-idempotency-key", async () => {
            await db
              .update(drafts)
              .set({ lastIdempotencyKey: idempotencyKey!, updatedAt: new Date() })
              .where(eq(drafts.id, draftId));
          });
        }
      }
      const postOptions: PostOptions = { idempotencyKey };

      // 7a. Recover an orphaned publish — only when no publishedPostId AND
      // slug_lookup is available. Without it we fall through to POST and
      // rely on the CMS's silent slug-suffix reconciliation.
      let recoveredPostId: string | null = null;
      if (!draft.publishedPostId && capabilities.features.slug_lookup && draft.slug) {
        const lookup = await step.run("slug-lookup", async () => {
          return cmsClient.findPostBySlug(siteCtx, draft.slug);
        });
        if (lookup.ok && lookup.data) {
          recoveredPostId = lookup.data.id;
          await step.run("persist-recovered-post-id", async () => {
            await db
              .update(drafts)
              .set({ publishedPostId: lookup.data!.id, updatedAt: new Date() })
              .where(eq(drafts.id, draftId));
          });
        }
      }

      const effectivePostId = draft.publishedPostId ?? recoveredPostId;

      // 8. Publish — PUT when we know the post id, POST otherwise.
      const postResult = await step.run("publish-post", async () => {
        if (effectivePostId) {
          return cmsClient.updatePost(siteCtx, effectivePostId, normalized, postOptions);
        }
        return cmsClient.createPost(siteCtx, normalized, postOptions);
      });

      if (!postResult.ok) {
        // Surface failureCode when the typed error is known.
        const code = postResult.cmsError?.code ?? null;
        throw new PublishFailure(postResult.error, code);
      }

      const { id: publishedPostId, url: publishedUrl, slug: canonicalSlug } = postResult.data;
      const replayed = postResult.meta?.idempotencyReplayed === true;

      // 9. Persist publish results (unless this was a replay — then the
      // previous publish already wrote them and we just confirm). Always
      // persist publishedPostId so future retries hit the PUT path.
      await step.run("mark-published", async () => {
        await db
          .update(drafts)
          .set({
            status: "published",
            publishedPostId,
            publishedUrl,
            // draft.publishedAt may be a serialized string after step.run; re-hydrate.
            publishedAt: replayed
              ? draft.publishedAt
                ? new Date(draft.publishedAt as unknown as string | Date)
                : new Date()
              : new Date(),
            ...(canonicalSlug ? { slug: canonicalSlug } : {}),
            // Clear failure metadata on success.
            failureReason: null,
            failureCode: null,
            updatedAt: new Date(),
          })
          .where(eq(drafts.id, draftId));

        await db
          .update(jobs)
          .set({ status: "completed", completedAt: new Date() })
          .where(eq(jobs.id, jobId));
      });

      // 10. Cache-warm verification. Best-effort — never fails the job.
      //   Prefer features.single_post_lookup (faster, authoritative).
      //   Else GET the public URL and assert 200.
      //   Result lands in apiCalls.metadata via the request layer.
      await step.sleep("cache-warm-wait", "1500ms");
      await step.run("cache-warm-verify", async () => {
        try {
          if (capabilities.features.single_post_lookup) {
            await cmsClient.getPostById(siteCtx, publishedPostId);
            return { method: "lookup-by-id", ok: true };
          }
          if (publishedUrl) {
            const r = await fetch(publishedUrl, { method: "GET" });
            return { method: "fetch-url", ok: r.ok, status: r.status };
          }
          return { method: "skipped", ok: true };
        } catch (e) {
          return { method: "errored", ok: false, error: String(e) };
        }
      });

      return { publishedPostId, publishedUrl, slug: canonicalSlug, replayed };
    } catch (err) {
      const failureReason = err instanceof Error ? err.message : "Unknown error";
      const failureCode = errorCodeFor(err);

      await step.run("mark-failed", async () => {
        await db
          .update(drafts)
          .set({
            status: "failed",
            failureReason,
            failureCode,
            updatedAt: new Date(),
          })
          .where(eq(drafts.id, draftId));

        await db
          .update(jobs)
          .set({ status: "failed", errorMessage: failureReason, completedAt: new Date() })
          .where(eq(jobs.id, jobId));
      });

      // Re-throw so Inngest records the failure for visibility — but don't
      // automatically retry past MAX_PUBLISH_ATTEMPTS (the next attempt will
      // bail in the mark-running guard above).
      throw err;
    }
  }
);

/** Internal error that carries the typed CMS code alongside the message. */
class PublishFailure extends Error {
  public readonly cmsCode: string | null;
  constructor(message: string, cmsCode: string | null) {
    super(message);
    this.name = "PublishFailure";
    this.cmsCode = cmsCode;
  }
}

function errorCodeFor(err: unknown): string | null {
  if (err instanceof PublishFailure) return err.cmsCode;
  if (err instanceof CnosCmsError) return err.code;
  return null;
}
