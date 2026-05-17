import { inngest } from "@/lib/inngest";
import { db } from "@/lib/db";
import { drafts, sites, jobs } from "@/db/schema";
import { decrypt } from "@/lib/crypto";
import * as cmsClient from "@/lib/cms-client";
import { eq } from "drizzle-orm";

async function reuploadImageIfNeeded(
  imageUrl: string,
  siteHostname: string,
  apiBaseUrl: string,
  apiKey: string
): Promise<string> {
  if (imageUrl.includes(siteHostname)) {
    return imageUrl;
  }

  const res = await fetch(imageUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch image: ${res.status}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const contentType = res.headers.get("content-type") ?? "image/jpeg";
  const extension = contentType.split("/")[1] ?? "jpg";
  const filename = `cover-image.${extension}`;

  const formData = new FormData();
  const blob = new Blob([buffer], { type: contentType });
  formData.append("file", blob, filename);

  const uploadResult = await cmsClient.uploadFiles(apiBaseUrl, apiKey, formData);
  if (!uploadResult.ok) {
    throw new Error(`Failed to upload image: ${uploadResult.error}`);
  }

  const sourceUrl =
    (uploadResult.data as Record<string, unknown>)?.source_url as string | undefined;
  if (!sourceUrl) {
    throw new Error("Upload succeeded but no source_url returned");
  }

  return sourceUrl;
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

      // 3. Load target site and decrypt apiKey
      const site = await step.run("load-site", async () => {
        return db.query.sites.findFirst({ where: eq(sites.id, draft.targetSiteId!) });
      });

      if (!site) throw new Error(`Site ${draft.targetSiteId} not found`);

      const decryptedApiKey = decrypt(site.apiKey);

      // 4. Re-upload cover image if needed
      let finalCoverImageUrl: string | null = draft.coverImageUrl ?? null;

      if (finalCoverImageUrl) {
        finalCoverImageUrl = await step.run("reupload-image", async () => {
          return reuploadImageIfNeeded(
            draft.coverImageUrl!,
            site.hostname,
            site.apiBaseUrl,
            decryptedApiKey
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

      // 5. Build POST /posts payload
      const payload: Record<string, unknown> = {
        title: draft.title,
        slug: draft.slug,
        content: draft.contentHtml,
        status: "publish",
        ...(draft.excerpt && { excerpt: draft.excerpt }),
        ...(draft.seoTitle && { meta: { _yoast_wpseo_title: draft.seoTitle } }),
        ...(draft.targetCategory && { categories: [draft.targetCategory] }),
      };

      // 6. Call createPost
      const postResult = await step.run("create-post", async () => {
        return cmsClient.createPost(site.apiBaseUrl, decryptedApiKey, payload);
      });

      if (!postResult.ok) {
        throw new Error(postResult.error);
      }

      const postData = postResult.data as Record<string, unknown>;
      const publishedPostId = String(postData.id ?? "");
      const publishedUrl = (postData.link as string | undefined) ?? "";

      // 7. On success: update draft and job
      await step.run("mark-published", async () => {
        await db
          .update(drafts)
          .set({
            status: "published",
            publishedPostId,
            publishedUrl,
            publishedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(drafts.id, draftId));

        await db
          .update(jobs)
          .set({ status: "completed", completedAt: new Date() })
          .where(eq(jobs.id, jobId));
      });

      return { publishedPostId, publishedUrl };
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
