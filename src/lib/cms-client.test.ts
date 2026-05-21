import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock @/lib/db before importing the module under test ─────────────────
// cms-client.request() logs every call via `db.insert(apiCalls).values(...)`.
// We don't have a real DB in tests, so stub the chain to a no-op promise.
vi.mock("@/lib/db", () => ({
  db: {
    insert: () => ({
      values: () => Promise.resolve(),
    }),
    update: () => ({
      set: () => ({
        where: () => Promise.resolve(),
      }),
    }),
  },
}));

import {
  extractInlineImages,
  createPost,
  testConnection,
  uploadFile,
  type SiteContext,
  type NormalizedPostInput,
} from "./cms-client";

const PINTEREST_SITE: SiteContext = {
  apiBaseUrl: "https://example.com/api/public/v1",
  apiKey: "cms_live_test_key",
  kind: "pinterest-cms",
  id: "site-123",
};

const WP_SITE: SiteContext = {
  apiBaseUrl: "https://example.com",
  apiKey: "wp_app_password",
  kind: "wordpress",
};

// ─────────────────────────────────────────────────────────────────────────────
// extractInlineImages — pure function, no fetch needed
// ─────────────────────────────────────────────────────────────────────────────

describe("extractInlineImages", () => {
  it("extracts src + alt from a basic <img>", () => {
    const out = extractInlineImages('<img src="https://x.com/a.png" alt="A">');
    expect(out).toEqual([{ url: "https://x.com/a.png", alt: "A" }]);
  });

  it("tolerates attribute order", () => {
    const out = extractInlineImages('<img alt="A" src="https://x.com/a.png">');
    expect(out).toEqual([{ url: "https://x.com/a.png", alt: "A" }]);
  });

  it("tolerates single quotes", () => {
    const out = extractInlineImages("<img src='https://x.com/a.png' alt='A'>");
    expect(out).toEqual([{ url: "https://x.com/a.png", alt: "A" }]);
  });

  it("emits alt undefined when missing", () => {
    const out = extractInlineImages('<img src="https://x.com/a.png">');
    expect(out).toEqual([{ url: "https://x.com/a.png", alt: undefined }]);
  });

  it("skips data: URLs", () => {
    const out = extractInlineImages(
      '<img src="data:image/png;base64,aaaa" alt="x">'
    );
    expect(out).toEqual([]);
  });

  it("skips blob: URLs", () => {
    const out = extractInlineImages('<img src="blob:https://x.com/abc">');
    expect(out).toEqual([]);
  });

  it("returns empty on empty input", () => {
    expect(extractInlineImages("")).toEqual([]);
    expect(extractInlineImages("just prose")).toEqual([]);
  });

  it("extracts multiple images in document order", () => {
    const html = `<p>x</p>
<img src="https://x.com/a.png">
<p>y</p>
<img src="https://x.com/b.png" alt="b">`;
    const out = extractInlineImages(html);
    expect(out).toEqual([
      { url: "https://x.com/a.png", alt: undefined },
      { url: "https://x.com/b.png", alt: "b" },
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Dialect dispatch — mocked fetch, asserts the right endpoint + body
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.restoreAllMocks();
});

/**
 * Helper: mock global.fetch to capture the call(s) and return a canned
 * success body. Returns the mock so the test can inspect calls.
 */
function mockFetchOnce(responseBody: unknown, responseInit: ResponseInit = { status: 200 }) {
  const headers = new Headers({
    "content-type": "application/json",
    ...((responseInit.headers as Record<string, string> | undefined) ?? {}),
  });
  const mock = vi.fn(async () =>
    new Response(JSON.stringify(responseBody), { ...responseInit, headers })
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}

describe("testConnection — dialect dispatch", () => {
  it("pinterest-cms → GET /status", async () => {
    const fetchMock = mockFetchOnce({ status: "ok", site: { name: "Test Site" } });
    const res = await testConnection(
      PINTEREST_SITE.apiBaseUrl,
      PINTEREST_SITE.apiKey,
      "pinterest-cms"
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.name).toBe("Test Site");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe("https://example.com/api/public/v1/status");
    expect((init as RequestInit).method).toBe("GET");
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: `Bearer ${PINTEREST_SITE.apiKey}`,
    });
  });

  it("wordpress (default) → GET /wp-json", async () => {
    const fetchMock = mockFetchOnce({ name: "WP Site" });
    const res = await testConnection(WP_SITE.apiBaseUrl, WP_SITE.apiKey);
    expect(res.ok).toBe(true);
    const [calledUrl] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe("https://example.com/wp-json");
  });

  it("pinterest-cms rejects when /status returns ok:false-shaped payload", async () => {
    mockFetchOnce({ status: "degraded" });
    const res = await testConnection(
      PINTEREST_SITE.apiBaseUrl,
      PINTEREST_SITE.apiKey,
      "pinterest-cms"
    );
    expect(res.ok).toBe(false);
  });
});

describe("uploadFile — dialect dispatch", () => {
  it("pinterest-cms POSTs to /upload with files field and reads uploaded[].url", async () => {
    const fetchMock = mockFetchOnce({
      success: true,
      uploaded: [
        {
          url: "https://cdn.example.com/x.png",
          mediaId: "media-1",
          filename: "x.png",
          size: 1234,
          alt: "alt",
          caption: "",
          r2Key: "k",
        },
      ],
    });
    const buf = Buffer.from([1, 2, 3]);
    const res = await uploadFile(PINTEREST_SITE, buf, "x.png", "image/png", "alt");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.url).toBe("https://cdn.example.com/x.png");
      expect(res.data.mediaId).toBe("media-1");
    }
    const [calledUrl, init] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe("https://example.com/api/public/v1/upload");
    expect((init as RequestInit).method).toBe("POST");
    // FormData body — can't easily inspect entries cross-platform, but at
    // least confirm the body is a FormData (browser polyfill returns
    // FormData instance).
    expect((init as RequestInit).body).toBeInstanceOf(FormData);
  });

  it("wordpress POSTs to /wp-json/wp/v2/media with file field and reads source_url", async () => {
    const fetchMock = mockFetchOnce({
      id: 42,
      source_url: "https://wp.example.com/x.png",
    });
    const buf = Buffer.from([1, 2, 3]);
    const res = await uploadFile(WP_SITE, buf, "x.png", "image/png", "alt");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.url).toBe("https://wp.example.com/x.png");
      expect(res.data.mediaId).toBe("42");
    }
    const [calledUrl] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe("https://example.com/wp-json/wp/v2/media");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Pinterest field mapper — exhaustive
// ─────────────────────────────────────────────────────────────────────────────

describe("createPost — Pinterest CMS field mapper", () => {
  const BASE_INPUT: NormalizedPostInput = {
    title: "25 Hotel-Style Bedroom Decor Ideas",
    slug: "hotel-style-bedroom-decor",
    contentHtml: "<p>Lush prose.</p>",
    excerpt: "Hand-written excerpt.",
    coverImageUrl: "https://cdn.example.com/cover.png",
    coverImageAlt: "Cover alt",
    seoTitle: "Custom SEO Title",
    seoDescription: "Custom SEO Description",
    seoKeywords: "bedroom, decor, hotel",
    targetCategory: "Interiors",
  };

  function lastBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    return JSON.parse(init.body as string) as Record<string, unknown>;
  }

  it("hits /posts and sends published:true", async () => {
    const fetchMock = mockFetchOnce({
      success: true,
      post: { id: "p1", slug: "hotel-style-bedroom-decor", url: "https://x" },
    });
    const res = await createPost(PINTEREST_SITE, BASE_INPUT);
    expect(res.ok).toBe(true);
    const [calledUrl] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe("https://example.com/api/public/v1/posts");
    const body = lastBody(fetchMock);
    expect(body.published).toBe(true);
    expect(body.title).toBe(BASE_INPUT.title);
    expect(body.content).toBe(BASE_INPUT.contentHtml);
    expect(body.slug).toBe(BASE_INPUT.slug);
  });

  it("lowercases the category slug", async () => {
    const fetchMock = mockFetchOnce({
      success: true,
      post: { id: "p1", slug: "x", url: "https://x" },
    });
    await createPost(PINTEREST_SITE, BASE_INPUT);
    const body = lastBody(fetchMock);
    expect(body.category).toBe("interiors");
  });

  it("emits both tags array and seoKeywords string from comma-separated seoKeywords", async () => {
    const fetchMock = mockFetchOnce({
      success: true,
      post: { id: "p1", slug: "x", url: "https://x" },
    });
    await createPost(PINTEREST_SITE, BASE_INPUT);
    const body = lastBody(fetchMock);
    expect(body.tags).toEqual(["bedroom", "decor", "hotel"]);
    expect(body.seoKeywords).toBe("bedroom, decor, hotel");
  });

  it("populates OG defaults from seoTitle / seoDescription when no overrides", async () => {
    const fetchMock = mockFetchOnce({
      success: true,
      post: { id: "p1", slug: "x", url: "https://x" },
    });
    await createPost(PINTEREST_SITE, BASE_INPUT);
    const body = lastBody(fetchMock);
    expect(body.ogTitle).toBe("Custom SEO Title");
    expect(body.ogDescription).toBe("Custom SEO Description");
    expect(body.ogImage).toBe(BASE_INPUT.coverImageUrl);
    expect(body.twitterCard).toBe("summary_large_image");
  });

  it("falls back excerpt to first 160 chars of stripped content when missing", async () => {
    const fetchMock = mockFetchOnce({
      success: true,
      post: { id: "p1", slug: "x", url: "https://x" },
    });
    const longProse = "<p>" + "A".repeat(300) + "</p>";
    await createPost(PINTEREST_SITE, {
      ...BASE_INPUT,
      excerpt: null,
      contentHtml: longProse,
    });
    const body = lastBody(fetchMock);
    expect(typeof body.excerpt).toBe("string");
    expect((body.excerpt as string).length).toBeLessThanOrEqual(160);
  });

  it("explicit ogTitle/ogDescription override the SEO defaults", async () => {
    const fetchMock = mockFetchOnce({
      success: true,
      post: { id: "p1", slug: "x", url: "https://x" },
    });
    await createPost(PINTEREST_SITE, {
      ...BASE_INPUT,
      ogTitle: "Pin Title!",
      ogDescription: "Pin Description!",
    });
    const body = lastBody(fetchMock);
    expect(body.ogTitle).toBe("Pin Title!");
    expect(body.ogDescription).toBe("Pin Description!");
  });

  it("sends Idempotency-Key header when provided in options", async () => {
    const fetchMock = mockFetchOnce({
      success: true,
      post: { id: "p1", slug: "x", url: "https://x" },
    });
    await createPost(PINTEREST_SITE, BASE_INPUT, {
      idempotencyKey: "key-1",
    });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("key-1");
  });

  it("does NOT send Idempotency-Key when not provided", async () => {
    const fetchMock = mockFetchOnce({
      success: true,
      post: { id: "p1", slug: "x", url: "https://x" },
    });
    await createPost(PINTEREST_SITE, BASE_INPUT);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBeUndefined();
  });

  it("reads Idempotency-Replayed header into meta", async () => {
    const headers = {
      "content-type": "application/json",
      "idempotency-replayed": "true",
    };
    const mock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          success: true,
          post: { id: "p1", slug: "x", url: "https://x" },
        }),
        { status: 200, headers }
      )
    );
    vi.stubGlobal("fetch", mock);

    const res = await createPost(PINTEREST_SITE, BASE_INPUT, {
      idempotencyKey: "key-1",
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.meta?.idempotencyReplayed).toBe(true);
  });

  it("returns canonical slug from response (handles auto-suffix)", async () => {
    mockFetchOnce({
      success: true,
      post: {
        id: "p1",
        slug: "hotel-style-bedroom-decor-2",
        url: "https://x/.../hotel-style-bedroom-decor-2",
      },
    });
    const res = await createPost(PINTEREST_SITE, BASE_INPUT);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.slug).toBe("hotel-style-bedroom-decor-2");
      expect(res.data.id).toBe("p1");
    }
  });

  it("surfaces error.code from the response body as typed CnosCmsError", async () => {
    mockFetchOnce(
      { error: "slug already exists", code: "slug_conflict" },
      { status: 409 }
    );
    const res = await createPost(PINTEREST_SITE, BASE_INPUT);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.cmsError?.code).toBe("slug_conflict");
    }
  });
});

describe("createPost — WordPress dialect mapper", () => {
  it("hits /wp-json/wp/v2/posts with status:publish and meta._yoast_wpseo_title", async () => {
    const fetchMock = mockFetchOnce({
      id: 7,
      link: "https://wp.example.com/?p=7",
      slug: "wp-slug",
    });
    await createPost(WP_SITE, {
      title: "WP post",
      slug: "wp-slug",
      contentHtml: "<p>x</p>",
      seoTitle: "Yoast Title",
    });
    const [calledUrl] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe("https://example.com/wp-json/wp/v2/posts");
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string
    );
    expect(body.status).toBe("publish");
    expect(body.meta).toEqual({ _yoast_wpseo_title: "Yoast Title" });
  });
});
