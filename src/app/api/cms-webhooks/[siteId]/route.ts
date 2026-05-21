/**
 * Pinterest CMS webhook receiver.
 *
 * Verifies the X-CMS-Signature header (Stripe-style HMAC-SHA256), dedupes
 * by X-CMS-Delivery, and then maps events:
 *
 *   post.created / post.updated / post.published:
 *     - if the post id matches a known draft.publishedPostId → no-op
 *       (echo of our own publish)
 *     - else → insert as an "imported" draft so it shows up in inventory
 *
 *   post.deleted:
 *     - clear publishedPostId/Url on the matching draft and reset
 *       status to 'draft' so the user can decide what to do
 *
 *   category.created:
 *     - no-op for now; future work could refresh the category cache
 *
 * If features.webhooks is false, this endpoint still exists but no CMS
 * will ever call it (we don't auto-register). It's safe to leave deployed.
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sites, drafts, webhookDeliveries, projects } from "@/db/schema";
import { decrypt } from "@/lib/crypto";
import { eq, lt } from "drizzle-orm";
import { verifyWebhookSignature } from "@/lib/cms-webhook-signature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Prune deliveries older than this; keeps the table small without a cron.
const DELIVERY_PRUNE_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

type WebhookPayload = {
  event: string; // e.g. "post.created"
  delivery?: string; // backup if X-CMS-Delivery header missing
  data?: {
    post?: {
      id: string;
      slug?: string;
      url?: string;
      title?: string;
      [k: string]: unknown;
    };
    category?: { id: string; slug?: string; name?: string };
    [k: string]: unknown;
  };
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const { siteId } = await params;

  // 1. Load site + decrypted webhook secret.
  const site = await db.query.sites.findFirst({ where: eq(sites.id, siteId) });
  if (!site) {
    return new NextResponse("Unknown site", { status: 404 });
  }
  if (!site.webhookSecret) {
    // No webhook secret persisted ⇒ webhook was never registered. Refuse so
    // we don't silently accept unsigned events.
    return new NextResponse("Webhook not registered for site", { status: 404 });
  }

  let decryptedSecret: string;
  try {
    decryptedSecret = decrypt(site.webhookSecret);
  } catch {
    return new NextResponse("Webhook secret unreadable", { status: 500 });
  }

  // 2. Read raw body — signature verification requires the EXACT bytes
  // the CMS signed, not a re-serialized version.
  const rawBody = await req.text();
  const sigHeader = req.headers.get("x-cms-signature");
  const verification = verifyWebhookSignature(rawBody, sigHeader, decryptedSecret);
  if (!verification.ok) {
    return new NextResponse(`Invalid signature: ${verification.reason}`, {
      status: 401,
    });
  }

  // 3. Dedupe by delivery id. X-CMS-Delivery is preferred; fall back to a
  // body-supplied delivery field if the header is missing.
  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WebhookPayload;
  } catch {
    return new NextResponse("Invalid JSON body", { status: 400 });
  }
  const deliveryId = req.headers.get("x-cms-delivery") ?? payload.delivery ?? null;
  if (!deliveryId) {
    return new NextResponse("Missing X-CMS-Delivery header", { status: 400 });
  }

  // Atomic dedupe: insert and let UNIQUE PK fail if already seen.
  try {
    await db.insert(webhookDeliveries).values({ id: deliveryId });
  } catch {
    // Already processed — return 200 so the CMS stops retrying.
    return NextResponse.json({ ok: true, deduped: true });
  }

  // Best-effort cleanup of old delivery rows. Don't fail the webhook on
  // cleanup errors.
  try {
    const cutoff = new Date(Date.now() - DELIVERY_PRUNE_AGE_MS);
    await db.delete(webhookDeliveries).where(lt(webhookDeliveries.receivedAt, cutoff));
  } catch {
    /* swallow */
  }

  // 4. Dispatch on event.
  const event = payload.event;
  try {
    switch (event) {
      case "post.created":
      case "post.updated":
      case "post.published":
        await handlePostUpsert(siteId, payload);
        break;
      case "post.deleted":
        await handlePostDeleted(siteId, payload);
        break;
      case "category.created":
        // No-op for now. Future: invalidate categories cache.
        break;
      default:
        // Unknown event — accept but no-op.
        break;
    }
  } catch (err) {
    return new NextResponse(
      `Webhook handler error: ${err instanceof Error ? err.message : String(err)}`,
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, event });
}

/**
 * post.created / post.updated / post.published:
 *  - If the post id matches a draft we already published → no-op (echo).
 *  - Else → insert as an imported draft for inventory tracking.
 */
async function handlePostUpsert(siteId: string, payload: WebhookPayload) {
  const post = payload.data?.post;
  if (!post?.id) return;

  // Echo of one of our own publishes?
  const existing = await db.query.drafts.findFirst({
    where: eq(drafts.publishedPostId, post.id),
  });
  if (existing) {
    // Optionally refresh slug / url if they changed CMS-side.
    if (post.slug && existing.slug !== post.slug) {
      await db
        .update(drafts)
        .set({ slug: post.slug, updatedAt: new Date() })
        .where(eq(drafts.id, existing.id));
    }
    return;
  }

  // Not one of ours — insert as an imported published draft. Requires a
  // projectId; we pick the first project on the assumption that imports
  // belong to whichever project owns the site (CNOS doesn't yet track
  // project-per-site). If there are no projects, skip silently — the user
  // will see the post on the CMS but not in CNOS, which is acceptable.
  const firstProject = await db.query.projects.findFirst({
    orderBy: (p, { asc }) => [asc(p.createdAt)],
  });
  if (!firstProject) return;

  // Drafts table requires non-null contentHtml — store an empty placeholder
  // for imports; the source-of-truth is on the CMS.
  await db.insert(drafts).values({
    projectId: firstProject.id,
    title: post.title ?? "Imported post",
    slug: post.slug ?? post.id,
    contentHtml: "<p><em>Imported from CMS — content lives on the CMS.</em></p>",
    status: "published",
    targetSiteId: siteId,
    publishedPostId: post.id,
    publishedUrl: (post.url as string | undefined) ?? null,
    publishedAt: new Date(),
  });

  // Mark the unused projects import to silence any lint warning.
  void projects;
}

/**
 * post.deleted: clear publish metadata on the matching draft and reset
 * status to 'draft' so the user can decide what to do.
 */
async function handlePostDeleted(_siteId: string, payload: WebhookPayload) {
  const post = payload.data?.post;
  if (!post?.id) return;
  await db
    .update(drafts)
    .set({
      status: "draft",
      publishedPostId: null,
      publishedUrl: null,
      updatedAt: new Date(),
    })
    .where(eq(drafts.publishedPostId, post.id));
}
