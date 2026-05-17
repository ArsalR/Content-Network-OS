import { db } from "@/lib/db";
import { apiCalls } from "@/db/schema";

type CmsResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function request<T>(
  method: string,
  apiBaseUrl: string,
  apiKey: string,
  path: string,
  body?: unknown,
  isFormData?: boolean
): Promise<CmsResult<T>> {
  const url = `${apiBaseUrl.replace(/\/$/, "")}${path}`;
  const start = Date.now();
  let attempt = 0;
  const maxRetries = 2;

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
        const errorMsg =
          typeof data === "string"
            ? data
            : (data as Record<string, unknown>)?.message?.toString() ??
              `HTTP ${res.status}`;

        await db.insert(apiCalls).values({
          kind: "cms_publish",
          status: "error",
          durationMs,
          errorMessage: errorMsg,
          metadata: { method, url, statusCode: res.status },
        });

        return { ok: false, error: errorMsg };
      }

      await db.insert(apiCalls).values({
        kind: "cms_publish",
        status: "success",
        durationMs,
        metadata: { method, url, statusCode: res.status },
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
          kind: "cms_publish",
          status: "error",
          durationMs,
          errorMessage: errorMsg,
          metadata: { method, url },
        });

        return { ok: false, error: errorMsg };
      }

      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
      attempt++;
    }
  }

  return { ok: false, error: "Max retries exceeded" };
}

export async function testConnection(
  apiBaseUrl: string,
  apiKey: string
): Promise<CmsResult<{ name?: string }>> {
  return request<{ name?: string }>("GET", apiBaseUrl, apiKey, "/wp-json");
}

export async function getCategories(
  apiBaseUrl: string,
  apiKey: string
): Promise<CmsResult<unknown[]>> {
  return request<unknown[]>("GET", apiBaseUrl, apiKey, "/wp-json/wp/v2/categories?per_page=100");
}

export async function listPosts(
  apiBaseUrl: string,
  apiKey: string,
  params?: Record<string, string>
): Promise<CmsResult<unknown[]>> {
  const query = params ? "?" + new URLSearchParams(params).toString() : "";
  return request<unknown[]>("GET", apiBaseUrl, apiKey, `/wp-json/wp/v2/posts${query}`);
}

export async function createPost(
  apiBaseUrl: string,
  apiKey: string,
  post: Record<string, unknown>
): Promise<CmsResult<Record<string, unknown>>> {
  return request<Record<string, unknown>>("POST", apiBaseUrl, apiKey, "/wp-json/wp/v2/posts", post);
}

export async function updatePost(
  apiBaseUrl: string,
  apiKey: string,
  postId: string | number,
  post: Record<string, unknown>
): Promise<CmsResult<Record<string, unknown>>> {
  return request<Record<string, unknown>>(
    "PUT",
    apiBaseUrl,
    apiKey,
    `/wp-json/wp/v2/posts/${postId}`,
    post
  );
}

export async function deletePost(
  apiBaseUrl: string,
  apiKey: string,
  postId: string | number
): Promise<CmsResult<Record<string, unknown>>> {
  return request<Record<string, unknown>>(
    "DELETE",
    apiBaseUrl,
    apiKey,
    `/wp-json/wp/v2/posts/${postId}`
  );
}

export async function uploadFiles(
  apiBaseUrl: string,
  apiKey: string,
  formData: FormData
): Promise<CmsResult<Record<string, unknown>>> {
  return request<Record<string, unknown>>(
    "POST",
    apiBaseUrl,
    apiKey,
    "/wp-json/wp/v2/media",
    formData,
    true
  );
}
