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
import { MAX_PUBLISH_ATTEMPTS } from "@/lib/publish-constants";
import { validatePinterestDimensions } from "@/lib/image-validation";
import { and, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";

type PinterestMeta = {
  title?: string | null;
  description?: string | null;
  hashtags?: string[] | null;
};

type GalleryImageInput = {
  url: string;
  alt?: string | null;
  caption?: string | null;
  order?: number;
};

/** Replace every <img src="OLD"> with <img src="NEW">, preserving other attrs. */
function rewriteImgSrc(html: string, oldUrl: string, newUrl: string): string {
  if (oldUrl === newUrl) return html;
  const escapedSearch = oldUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // `$` in `newUrl` is interpreted as a back-reference in String.replace;
  // double it so the literal value reaches the output (signed CloudFront /
  // S3 URLs sometimes contain `$`).
  const safeReplacement = newUrl.replace(/\$/g, "$$$$");
  const re = new RegExp(
    `(<img\\b[^>]*\\bsrc\\s*=\\s*)(?:"${escapedSearch}"|'${escapedSearch}'|${escapedSearch})`,
    "gi"
  );
  return html.replace(re, `$1"${safeReplacement}"`);
}

/**
 * Returns true if `url` is already hosted on the target CMS host. Compares
 * the URL's parsed hostname against `siteHostname` exactly (or as a suffix
 * match for subdomains of the same root). Substring matching on the full
 * URL would mis-classify `https://evil.com?ref=foo.com` as on-host.
 */
function urlIsOnHost(url: string, siteHostname: string): boolean {
  if (!url || !siteHostname) return false;
  const normalizedHost = siteHostname.replace(/^https?:\/\//, "").toLowerCase();
  try {
    const u = new URL(url);
    const h = u.hostname.toLowerCase();
    return h === normalizedHost || h.endsWith(`.${normalizedHost}`);
  } catch {
    return false;
  }
}

async function reuploadImageIfNeeded(
  imageUrl: string,
  siteCtx: SiteContext,
  siteHostname: string,
  alt?: string
): Promise<string> {
  if (urlIsOnHost(imageUrl, siteHostname)) return imageUrl;

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

    // 1. Mark job + draft running, atomically increment publishAttempts.
    // One UPDATE with `publish_attempts = publish_attempts + 1 RETURNING`
    // so a partial Inngest retry can't double-count. Returns the NEW
    // counter so we can bail before doing real work if we're past the cap.
    const attempts = await step.run("mark-running", async () => {
      await db
        .update(jobs)
        .set({ status: "running", startedAt: new Date() })
        .where(eq(jobs.id, jobId));

      const [row] = await db
        .update(drafts)
        .set({
          status: "publishing",
          publishAttempts: sql`${drafts.publishAttempts} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(drafts.id, draftId))
        .returning({ attempts: drafts.publishAttempts });

      return row?.attempts ?? 1;
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
      // getCapabilities accepts Date OR string for checkedAt so we don't have
      // to re-hydrate the Inngest-serialized timestamp here.
      const capabilities = await step.run("load-capabilities", async () => {
        return getCapabilities(
          {
            id: site.id,
            apiBaseUrl: site.apiBaseUrl,
            kind: site.kind,
            capabilitiesCache: site.capabilitiesCache,
            capabilitiesCheckedAt: site.capabilitiesCheckedAt,
          },
          decryptedApiKey
        );
      });

      // 3a. Pinterest cover validation — Pinterest-mode sites refuse any
      // cover image that isn't ≈2:3 vertical AND ≥800px wide. Catch this
      // before we waste a CMS upload or generate a bad pin. Fail with a
      // typed code so the kanban Failed card surfaces it cleanly.
      if (site.pinterestMode && draft.coverImageUrl) {
        const dimsCheck = await step.run("validate-cover-dimensions", async () => {
          try {
            const r = await fetch(draft.coverImageUrl!);
            if (!r.ok) {
              return {
                ok: false as const,
                error: `Could not fetch cover image (${r.status})`,
              };
            }
            const buf = Buffer.from(await r.arrayBuffer());
            return validatePinterestDimensions(buf);
          } catch (e) {
            return {
              ok: false as const,
              error: `Cover image fetch failed: ${
                e instanceof Error ? e.message : String(e)
              }`,
            };
          }
        });
        if (!dimsCheck.ok) {
          throw new PublishFailure(dimsCheck.error, "pinterest_cover_invalid");
        }
      }

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

      // 6. Build the normalized payload (dialect-agnostic). For Pinterest-mode
      // sites with a populated pinterestMeta, the OG fields are overridden by
      // the pin-friendly meta and hashtags are appended to seoKeywords so the
      // Pinterest crawler sees the optimized text.
      const pinterestMeta: PinterestMeta | null =
        site.pinterestMode && draft.pinterestMeta
          ? (draft.pinterestMeta as PinterestMeta)
          : null;

      const baseSeoKeywords = (draft.seoKeywords ?? "").trim();
      const hashtags = (pinterestMeta?.hashtags ?? [])
        .map((h) => h.trim().replace(/^#+/, ""))
        .filter(Boolean);
      const mergedSeoKeywords = hashtags.length
        ? [baseSeoKeywords, hashtags.join(", ")].filter(Boolean).join(", ")
        : baseSeoKeywords || null;

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
        seoKeywords: mergedSeoKeywords,
        targetCategory: draft.targetCategory ?? site.defaultCategory,
        ogTitle: pinterestMeta?.title ?? null,
        ogDescription: pinterestMeta?.description ?? null,
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
      //
      // The WHERE clause requires status='publishing' so the deadletter
      // can't lost-update us: if publishingDeadletter flipped us back to
      // 'scheduled' while we were running, this UPDATE matches 0 rows
      // and we surface that as an error rather than silently overwriting.
      await step.run("mark-published", async () => {
        const written = await db
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
            // Clear failure metadata + reset the attempt counter on success
            // so a future "Republish" gets the full cap (5) instead of
            // inheriting the previous run's count.
            failureReason: null,
            failureCode: null,
            publishAttempts: 0,
            updatedAt: new Date(),
          })
          .where(and(eq(drafts.id, draftId), eq(drafts.status, "publishing")))
          .returning({ id: drafts.id });

        if (written.length === 0) {
          // Deadletter (or another writer) snatched the row from under us.
          // Surface a clear error; the post IS published on the CMS so the
          // operator can manually reconcile.
          throw new Error(
            `mark-published lost-update: draft ${draftId} was not in 'publishing' state. ` +
              `Post ${publishedPostId} exists on the CMS — manually reconcile.`
          );
        }

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
            // 5s timeout — cache warming should not stall the publish job
            // if the public URL is slow to render.
            const controller = new AbortController();
            const t = setTimeout(() => controller.abort(), 5_000);
            try {
              const r = await fetch(publishedUrl, {
                method: "GET",
                signal: controller.signal,
              });
              return { method: "fetch-url", ok: r.ok, status: r.status };
            } finally {
              clearTimeout(t);
            }
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

      // For deterministic / user-fixable failures we DON'T want to burn one
      // of the 5 retry budgets — the user will edit the draft and click
      // Retry and that should give them a fresh attempt. Decrement the
      // counter we bumped at mark-running so the user's effective budget
      // is preserved.
      const isUserFixable =
        failureCode === "pinterest_cover_invalid" ||
        failureCode === "validation" ||
        failureCode === "slug_conflict" ||
        failureCode === "auth_invalid_key" ||
        failureCode === "auth_insufficient_permission";

      await step.run("mark-failed", async () => {
        await db
          .update(drafts)
          .set({
            status: "failed",
            failureReason,
            failureCode,
            ...(isUserFixable
              ? { publishAttempts: sql`GREATEST(${drafts.publishAttempts} - 1, 0)` }
              : {}),
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
