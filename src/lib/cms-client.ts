/**
 * CMS client — dialect-aware dispatcher.
 *
 * Two CMS dialects coexist:
 *  - "wordpress"      → /wp-json/wp/v2/*  (legacy, response uses `id` + `link` + `source_url`)
 *  - "pinterest-cms"  → /api/public/v1/*  (Hono worker, response uses `{ success, post: { id, url, slug } }`
 *                                          and uploads return `{ success, uploaded[]: { url, mediaId, ... } }`)
 *
 * Each public function accepts either:
 *   - the old "apiBaseUrl + apiKey + (kind)" signature for legacy callers / pre-save
 *     test connections, OR
 *   - a `Site` object for in-app callers that already have the site row.
 *
 * Network layer (timeout, retry, apiCalls logging) is shared between dialects.
 */

import { db } from "@/lib/db";
import { apiCalls } from "@/db/schema";

export type SiteKind = "wordpress" | "pinterest-cms";

type CmsResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Caller-provided site context. We accept a minimal shape so callers can pass
 * a partial site (e.g. during create-site testConnection before the row exists)
 * without TypeScript fights.
 */
export type SiteContext = {
  apiBaseUrl: string;
  apiKey: string; // already DECRYPTED — callers must decrypt before invoking
  kind?: SiteKind;
};

/** Normalised post payload (CNOS-internal shape) — dialect adapters translate this. */
export type NormalizedPostInput = {
  title: string;
  slug: string;
  contentHtml: string;
  excerpt?: string | null;
  coverImageUrl?: string | null;
  coverImageAlt?: string | null;
  galleryImages?: Array<{
    url: string;
    alt?: string | null;
    caption?: string | null;
    order?: number;
  }>;
  seoTitle?: string | null;
  seoDescription?: string | null;
  seoKeywords?: string | null;
  targetCategory?: string | null;
  // Optional Open Graph / Twitter overrides — Pinterest dialect uses these.
  ogTitle?: string | null;
  ogDescription?: string | null;
  ogImage?: string | null;
  twitterCard?: string | null;
  canonicalUrl?: string | null;
  publishedAt?: Date | string | null;
};

/** Normalised post response — what every adapter returns to the publisher. */
export type NormalizedPostResult = {
  id: string;
  url: string;
  slug: string;
  raw: Record<string, unknown>; // dialect-native body for diagnostics
};

/** Normalised upload response — adapters always return at least `url`. */
export type NormalizedUploadResult = {
  url: string;
  mediaId?: string;
  raw: Record<string, unknown>;
};

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cheap HTML → plain-text fallback used to derive a default excerpt when the
 * draft hasn't been given one. Strips tags, decodes a handful of common
 * entities, and collapses whitespace. Not a full sanitizer — that's Phase 3.3.
 */
function htmlToPlainText(html: string): string {
  if (!html) return "";
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract <img src="..." alt="..."> tags from raw HTML in document order.
 * Used to surface inline images so they can be re-hosted on the target CMS
 * and end up in the post's `images[]` gallery alongside any
 * explicitly-attached gallery images.
 */
export function extractInlineImages(
  html: string
): Array<{ url: string; alt?: string }> {
  if (!html) return [];
  const out: Array<{ url: string; alt?: string }> = [];
  // Matches <img ...> with src + optional alt. Tolerant of attribute order
  // and quote style.
  const imgRe = /<img\b[^>]*>/gi;
  const srcRe = /\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i;
  const altRe = /\balt\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]*))/i;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(html)) !== null) {
    const tag = m[0];
    const srcMatch = srcRe.exec(tag);
    if (!srcMatch) continue;
    const src = (srcMatch[1] ?? srcMatch[2] ?? srcMatch[3] ?? "").trim();
    if (!src) continue;
    const altMatch = altRe.exec(tag);
    const alt = (altMatch?.[1] ?? altMatch?.[2] ?? altMatch?.[3] ?? "").trim();
    out.push({ url: src, alt: alt || undefined });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared network helper
// ─────────────────────────────────────────────────────────────────────────────

type RequestArgs = {
  method: string;
  apiBaseUrl: string;
  apiKey: string;
  path: string;
  body?: unknown;
  isFormData?: boolean;
  /** Used only for diagnostic differentiation in apiCalls.metadata. */
  cmsKind?: SiteKind;
  /** Whether this call uploads media (sets apiCalls.kind = "cms_upload"). */
  isUpload?: boolean;
};

async function request<T>({
  method,
  apiBaseUrl,
  apiKey,
  path,
  body,
  isFormData,
  cmsKind,
  isUpload,
}: RequestArgs): Promise<CmsResult<T>> {
  const url = `${apiBaseUrl.replace(/\/$/, "")}${path}`;
  const start = Date.now();
  let attempt = 0;
  const maxRetries = 2;
  const logKind = isUpload ? "cms_upload" : "cms_publish";

  while (attempt <= maxRetries) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
      };
      if (!isFormData) {
        headers["Content-Type"] = "application/json";
      }

      const res = await fetch(url, {
        method,
        headers,
        body: isFormData
          ? (body as FormData)
          : body !== undefined
            ? JSON.stringify(body)
            : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const durationMs = Date.now() - start;

      let data: T;
      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        data = (await res.json()) as T;
      } else {
        data = (await res.text()) as unknown as T;
      }

      if (!res.ok) {
        // Pinterest CMS returns `{ error: string }`; WP returns `{ message: string }`.
        // Try both, then fall back to the raw body or HTTP status.
        const errorMsg =
          typeof data === "string"
            ? data
            : ((data as Record<string, unknown>)?.error as string | undefined) ??
              ((data as Record<string, unknown>)?.message as string | undefined) ??
              `HTTP ${res.status}`;

        await db.insert(apiCalls).values({
          kind: logKind,
          status: "error",
          durationMs,
          errorMessage: errorMsg,
          metadata: { method, url, statusCode: res.status, cmsKind },
        });

        return { ok: false, error: errorMsg };
      }

      await db.insert(apiCalls).values({
        kind: logKind,
        status: "success",
        durationMs,
        metadata: { method, url, statusCode: res.status, cmsKind },
      });

      return { ok: true, data };
    } catch (err) {
      clearTimeout(timeout);
      const isNetworkError =
        err instanceof TypeError || (err instanceof Error && err.name === "AbortError");

      if (!isNetworkError || attempt >= maxRetries) {
        const durationMs = Date.now() - start;
        const errorMsg = err instanceof Error ? err.message : String(err);

        await db.insert(apiCalls).values({
          kind: logKind,
          status: "error",
          durationMs,
          errorMessage: errorMsg,
          metadata: { method, url, cmsKind },
        });

        return { ok: false, error: errorMsg };
      }

      // Exponential backoff: 1s, 2s.
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
      attempt++;
    }
  }

  return { ok: false, error: "Max retries exceeded" };
}

// ─────────────────────────────────────────────────────────────────────────────
// testConnection — dialect dispatcher
// ─────────────────────────────────────────────────────────────────────────────

export async function testConnection(
  apiBaseUrl: string,
  apiKey: string,
  kind: SiteKind = "wordpress"
): Promise<CmsResult<{ name?: string }>> {
  if (kind === "pinterest-cms") {
    const res = await request<{ status?: string; site?: { name?: string } }>({
      method: "GET",
      apiBaseUrl,
      apiKey,
      path: "/status",
      cmsKind: kind,
    });
    if (!res.ok) return res;
    if (res.data?.status !== "ok") {
      return { ok: false, error: `Unexpected status payload: ${JSON.stringify(res.data)}` };
    }
    return { ok: true, data: { name: res.data.site?.name } };
  }

  // Legacy WordPress
  return request<{ name?: string }>({
    method: "GET",
    apiBaseUrl,
    apiKey,
    path: "/wp-json",
    cmsKind: kind,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// getCategories
// ─────────────────────────────────────────────────────────────────────────────

export type NormalizedCategory = {
  id: string | number;
  name: string;
  slug: string;
};

export async function getCategories(
  site: SiteContext
): Promise<CmsResult<NormalizedCategory[]>> {
  const kind = site.kind ?? "wordpress";

  if (kind === "pinterest-cms") {
    type Resp = {
      success?: boolean;
      categories?: Array<{ id: string; name: string; slug: string }>;
    };
    const res = await request<Resp>({
      method: "GET",
      apiBaseUrl: site.apiBaseUrl,
      apiKey: site.apiKey,
      path: "/categories",
      cmsKind: kind,
    });
    if (!res.ok) return res;
    return {
      ok: true,
      data: (res.data?.categories ?? []).map((c) => ({ id: c.id, name: c.name, slug: c.slug })),
    };
  }

  type WpCategory = { id: number; name: string; slug: string };
  const res = await request<WpCategory[]>({
    method: "GET",
    apiBaseUrl: site.apiBaseUrl,
    apiKey: site.apiKey,
    path: "/wp-json/wp/v2/categories?per_page=100",
    cmsKind: kind,
  });
  if (!res.ok) return res;
  return { ok: true, data: res.data.map((c) => ({ id: c.id, name: c.name, slug: c.slug })) };
}

// ─────────────────────────────────────────────────────────────────────────────
// listPosts
// ─────────────────────────────────────────────────────────────────────────────

export async function listPosts(
  site: SiteContext,
  params?: Record<string, string>
): Promise<CmsResult<unknown[]>> {
  const kind = site.kind ?? "wordpress";
  const query = params ? "?" + new URLSearchParams(params).toString() : "";

  if (kind === "pinterest-cms") {
    type Resp = { success?: boolean; posts?: unknown[] };
    const res = await request<Resp>({
      method: "GET",
      apiBaseUrl: site.apiBaseUrl,
      apiKey: site.apiKey,
      path: `/posts${query}`,
      cmsKind: kind,
    });
    if (!res.ok) return res;
    return { ok: true, data: res.data?.posts ?? [] };
  }

  return request<unknown[]>({
    method: "GET",
    apiBaseUrl: site.apiBaseUrl,
    apiKey: site.apiKey,
    path: `/wp-json/wp/v2/posts${query}`,
    cmsKind: kind,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// createPost — accepts normalized input, returns normalized result
// ─────────────────────────────────────────────────────────────────────────────

export async function createPost(
  site: SiteContext,
  post: NormalizedPostInput
): Promise<CmsResult<NormalizedPostResult>> {
  const kind = site.kind ?? "wordpress";
  return kind === "pinterest-cms"
    ? createPostPinterestCms(site, post)
    : createPostWordpress(site, post);
}

async function createPostPinterestCms(
  site: SiteContext,
  post: NormalizedPostInput
): Promise<CmsResult<NormalizedPostResult>> {
  // Phase 2 field mapping with deterministic fall-backs so the CMS gets a
  // fully populated post even if the draft has gaps.

  // Excerpt: explicit value, else first 160 chars of stripped content text.
  const resolvedExcerpt =
    post.excerpt && post.excerpt.trim().length > 0
      ? post.excerpt.trim()
      : htmlToPlainText(post.contentHtml).slice(0, 160);

  // Tags from comma-separated seoKeywords.
  const tags = (post.seoKeywords ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const resolvedSeoTitle = post.seoTitle ?? post.title;
  const resolvedSeoDescription = post.seoDescription ?? resolvedExcerpt;
  const resolvedOgImage = post.ogImage ?? post.coverImageUrl ?? null;

  const body: Record<string, unknown> = {
    title: post.title,
    content: post.contentHtml,
    slug: post.slug,
    excerpt: resolvedExcerpt,
    published: true,
  };

  if (post.coverImageUrl) body.coverImage = post.coverImageUrl;

  if (post.galleryImages && post.galleryImages.length > 0) {
    body.images = post.galleryImages.map((g, i) => ({
      url: g.url,
      alt: g.alt ?? post.coverImageAlt ?? post.title,
      caption: g.caption ?? undefined,
      order: typeof g.order === "number" ? g.order : i,
    }));
  }

  if (post.targetCategory) body.category = post.targetCategory.toLowerCase();

  // Send tags as the array AND the explicit seoKeywords string so the CMS
  // gets the same data regardless of which precedence rule wins server-side.
  if (tags.length > 0) {
    body.tags = tags;
    body.seoKeywords = post.seoKeywords ?? tags.join(", ");
  } else if (post.seoKeywords) {
    body.seoKeywords = post.seoKeywords;
  }

  body.seoTitle = resolvedSeoTitle;
  body.seoDescription = resolvedSeoDescription;
  body.ogTitle = post.ogTitle ?? resolvedSeoTitle;
  body.ogDescription = post.ogDescription ?? resolvedSeoDescription;
  if (resolvedOgImage) body.ogImage = resolvedOgImage;
  body.twitterCard = post.twitterCard ?? "summary_large_image";

  if (post.canonicalUrl) body.canonicalUrl = post.canonicalUrl;
  if (post.publishedAt) {
    body.publishedAt =
      post.publishedAt instanceof Date ? post.publishedAt.toISOString() : post.publishedAt;
  }

  type Resp = {
    success?: boolean;
    post?: { id: string; slug: string; url: string };
    error?: string;
  };
  const res = await request<Resp>({
    method: "POST",
    apiBaseUrl: site.apiBaseUrl,
    apiKey: site.apiKey,
    path: "/posts",
    body,
    cmsKind: "pinterest-cms",
  });
  if (!res.ok) return res;
  if (!res.data?.post?.id || !res.data?.post?.slug || !res.data?.post?.url) {
    return { ok: false, error: `Malformed createPost response: ${JSON.stringify(res.data)}` };
  }
  return {
    ok: true,
    data: {
      id: res.data.post.id,
      slug: res.data.post.slug,
      url: res.data.post.url,
      raw: res.data as unknown as Record<string, unknown>,
    },
  };
}

async function createPostWordpress(
  site: SiteContext,
  post: NormalizedPostInput
): Promise<CmsResult<NormalizedPostResult>> {
  // Mirror the legacy payload shape so existing WP sites behave identically.
  const body: Record<string, unknown> = {
    title: post.title,
    slug: post.slug,
    content: post.contentHtml,
    status: "publish",
  };
  if (post.excerpt) body.excerpt = post.excerpt;
  if (post.seoTitle) body.meta = { _yoast_wpseo_title: post.seoTitle };
  // WordPress wants category IDs; we pass through whatever the user typed
  // (existing behavior — the brief explicitly preserves this).
  if (post.targetCategory) body.categories = [post.targetCategory];

  type Resp = { id?: number | string; link?: string; slug?: string };
  const res = await request<Resp>({
    method: "POST",
    apiBaseUrl: site.apiBaseUrl,
    apiKey: site.apiKey,
    path: "/wp-json/wp/v2/posts",
    body,
    cmsKind: "wordpress",
  });
  if (!res.ok) return res;
  const id = res.data?.id !== undefined ? String(res.data.id) : "";
  const url = res.data?.link ?? "";
  const slug = res.data?.slug ?? post.slug;
  if (!id) {
    return { ok: false, error: `Malformed createPost response: ${JSON.stringify(res.data)}` };
  }
  return {
    ok: true,
    data: { id, url, slug, raw: res.data as unknown as Record<string, unknown> },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// updatePost
// ─────────────────────────────────────────────────────────────────────────────

export async function updatePost(
  site: SiteContext,
  postId: string | number,
  post: Partial<NormalizedPostInput>
): Promise<CmsResult<NormalizedPostResult>> {
  const kind = site.kind ?? "wordpress";

  if (kind === "pinterest-cms") {
    const body: Record<string, unknown> = {};
    if (post.title !== undefined) body.title = post.title;
    if (post.contentHtml !== undefined) body.content = post.contentHtml;
    if (post.slug !== undefined) body.slug = post.slug;
    if (post.excerpt !== undefined) body.excerpt = post.excerpt;
    if (post.coverImageUrl !== undefined) body.coverImage = post.coverImageUrl;
    if (post.galleryImages !== undefined) {
      body.images = (post.galleryImages ?? []).map((g, i) => ({
        url: g.url,
        alt: g.alt ?? post.coverImageAlt ?? post.title ?? "",
        caption: g.caption ?? undefined,
        order: typeof g.order === "number" ? g.order : i,
      }));
    }
    if (post.targetCategory !== undefined && post.targetCategory !== null) {
      body.category = post.targetCategory.toLowerCase();
    }
    if (post.seoTitle !== undefined) body.seoTitle = post.seoTitle;
    if (post.seoDescription !== undefined) body.seoDescription = post.seoDescription;
    if (post.seoKeywords !== undefined) body.seoKeywords = post.seoKeywords;
    if (post.ogTitle !== undefined) body.ogTitle = post.ogTitle;
    if (post.ogDescription !== undefined) body.ogDescription = post.ogDescription;
    if (post.ogImage !== undefined) body.ogImage = post.ogImage;
    if (post.twitterCard !== undefined) body.twitterCard = post.twitterCard;
    if (post.canonicalUrl !== undefined) body.canonicalUrl = post.canonicalUrl;
    if (post.publishedAt !== undefined && post.publishedAt !== null) {
      body.publishedAt =
        post.publishedAt instanceof Date ? post.publishedAt.toISOString() : post.publishedAt;
    }

    type Resp = { success?: boolean; post?: { id: string; slug: string; url: string } };
    const res = await request<Resp>({
      method: "PUT",
      apiBaseUrl: site.apiBaseUrl,
      apiKey: site.apiKey,
      path: `/posts/${postId}`,
      body,
      cmsKind: kind,
    });
    if (!res.ok) return res;
    if (!res.data?.post?.id || !res.data?.post?.slug || !res.data?.post?.url) {
      return { ok: false, error: `Malformed updatePost response: ${JSON.stringify(res.data)}` };
    }
    return {
      ok: true,
      data: {
        id: res.data.post.id,
        slug: res.data.post.slug,
        url: res.data.post.url,
        raw: res.data as unknown as Record<string, unknown>,
      },
    };
  }

  // WordPress: PATCH-style update
  const body: Record<string, unknown> = {};
  if (post.title !== undefined) body.title = post.title;
  if (post.contentHtml !== undefined) body.content = post.contentHtml;
  if (post.slug !== undefined) body.slug = post.slug;
  if (post.excerpt !== undefined) body.excerpt = post.excerpt;
  if (post.seoTitle !== undefined) body.meta = { _yoast_wpseo_title: post.seoTitle };
  if (post.targetCategory !== undefined && post.targetCategory !== null) {
    body.categories = [post.targetCategory];
  }

  type WpResp = { id?: number | string; link?: string; slug?: string };
  const res = await request<WpResp>({
    method: "PUT",
    apiBaseUrl: site.apiBaseUrl,
    apiKey: site.apiKey,
    path: `/wp-json/wp/v2/posts/${postId}`,
    body,
    cmsKind: kind,
  });
  if (!res.ok) return res;
  const id = res.data?.id !== undefined ? String(res.data.id) : String(postId);
  const url = res.data?.link ?? "";
  const slug = res.data?.slug ?? post.slug ?? "";
  return {
    ok: true,
    data: { id, url, slug, raw: res.data as unknown as Record<string, unknown> },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// deletePost
// ─────────────────────────────────────────────────────────────────────────────

export async function deletePost(
  site: SiteContext,
  postId: string | number
): Promise<CmsResult<Record<string, unknown>>> {
  const kind = site.kind ?? "wordpress";
  return request<Record<string, unknown>>({
    method: "DELETE",
    apiBaseUrl: site.apiBaseUrl,
    apiKey: site.apiKey,
    path:
      kind === "pinterest-cms"
        ? `/posts/${postId}`
        : `/wp-json/wp/v2/posts/${postId}`,
    cmsKind: kind,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// uploadFiles — returns a normalized URL (and mediaId when available)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Upload a single file. Returns a normalized `{ url, mediaId? }`.
 *
 * Callers should use `buildUploadFormData()` to construct the FormData with the
 * right field name for the target dialect.
 */
export async function uploadFile(
  site: SiteContext,
  buffer: Buffer,
  filename: string,
  contentType: string,
  alt?: string
): Promise<CmsResult<NormalizedUploadResult>> {
  const kind = site.kind ?? "wordpress";

  if (kind === "pinterest-cms") {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(buffer)], { type: contentType });
    // CMS source: formData.getAll("files") — field name is literal "files" (no [])
    formData.append("files", blob, filename);
    if (alt) formData.append("alt[0]", alt);

    type Resp = {
      success?: boolean;
      uploaded?: Array<{ url: string; mediaId?: string }>;
    };
    const res = await request<Resp>({
      method: "POST",
      apiBaseUrl: site.apiBaseUrl,
      apiKey: site.apiKey,
      path: "/upload",
      body: formData,
      isFormData: true,
      cmsKind: kind,
      isUpload: true,
    });
    if (!res.ok) return res;
    const first = res.data?.uploaded?.[0];
    if (!first?.url) {
      return { ok: false, error: `Malformed upload response: ${JSON.stringify(res.data)}` };
    }
    return {
      ok: true,
      data: { url: first.url, mediaId: first.mediaId, raw: res.data as unknown as Record<string, unknown> },
    };
  }

  // WordPress: single file in `file` field; response is `source_url`.
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(buffer)], { type: contentType });
  formData.append("file", blob, filename);

  type WpResp = { id?: number; source_url?: string };
  const res = await request<WpResp>({
    method: "POST",
    apiBaseUrl: site.apiBaseUrl,
    apiKey: site.apiKey,
    path: "/wp-json/wp/v2/media",
    body: formData,
    isFormData: true,
    cmsKind: kind,
    isUpload: true,
  });
  if (!res.ok) return res;
  const url = res.data?.source_url;
  if (!url) {
    return { ok: false, error: `Malformed upload response: ${JSON.stringify(res.data)}` };
  }
  return {
    ok: true,
    data: {
      url,
      mediaId: res.data?.id !== undefined ? String(res.data.id) : undefined,
      raw: res.data as unknown as Record<string, unknown>,
    },
  };
}
