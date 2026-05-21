/**
 * Runtime CMS capability discovery.
 *
 * Hits `GET {apiBaseUrl}/capabilities` once per site, caches the result
 * on the site row for 24 hours (capabilitiesCache + capabilitiesCheckedAt),
 * and returns a DEFAULT shape (no features) if the endpoint 404s or any
 * error occurs.
 *
 * CRITICAL: every use of a CMS capability MUST be gated by the features
 * flag returned here — never by feature-sniffing a response. If a flag is
 * false, don't even attempt the capability (e.g. don't send an
 * Idempotency-Key header to a CMS that doesn't advertise idempotency).
 */

import { db } from "@/lib/db";
import { sites } from "@/db/schema";
import { eq } from "drizzle-orm";

export type CmsCapabilities = {
  version: string;
  features: {
    idempotency?: boolean;
    slug_lookup?: boolean;
    single_post_lookup?: boolean;
    error_codes?: boolean;
    webhooks?: boolean;
    rate_limit_headers?: boolean;
    batch_posts?: boolean;
    // Forward-compatible: any flag we haven't seen yet falls through here.
    [key: string]: boolean | undefined;
  };
  limits: {
    [key: string]: number;
  };
};

export const DEFAULT_CAPABILITIES: CmsCapabilities = {
  version: "0",
  features: {},
  limits: {},
};

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

type CapabilitiesSiteRow = {
  id: string;
  apiBaseUrl: string;
  kind: "wordpress" | "pinterest-cms";
  capabilitiesCache: unknown;
  capabilitiesCheckedAt: Date | string | null;
};

/**
 * Fetch capabilities for the given site. Uses a 24h DB-backed cache so
 * we don't probe on every request. On any failure (including 404) we
 * return DEFAULT_CAPABILITIES — callers must always be able to operate
 * with zero advertised features.
 *
 * WordPress sites don't have a capabilities endpoint; we short-circuit
 * to DEFAULT without making any HTTP call.
 *
 * `apiKey` should be the already-DECRYPTED API key. When present it's sent
 * as a Bearer token so the probe works against CMSes that require auth on
 * /capabilities. (The endpoint may also be public — auth is sent if and
 * only if the caller has the key handy.)
 */
export async function getCapabilities(
  site: CapabilitiesSiteRow,
  apiKey?: string
): Promise<CmsCapabilities> {
  // WP doesn't advertise capabilities. We treat it as "no features".
  if (site.kind !== "pinterest-cms") {
    return DEFAULT_CAPABILITIES;
  }

  // Fresh cache? Accepts Date or ISO string (Inngest step.run boundaries
  // serialize Dates to strings, so callers shouldn't have to re-hydrate).
  const cached = parseCachedCapabilities(site.capabilitiesCache);
  const checkedAtMs = toEpochMs(site.capabilitiesCheckedAt);
  if (cached && checkedAtMs !== null && Date.now() - checkedAtMs < CACHE_TTL_MS) {
    return cached;
  }

  // Probe.
  const fetched = await probeCapabilities(site.apiBaseUrl, apiKey);
  // Persist the (possibly DEFAULT) result so we don't re-probe for 24h on a
  // CMS that doesn't advertise capabilities yet.
  try {
    await db
      .update(sites)
      .set({
        capabilitiesCache: fetched,
        capabilitiesCheckedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(sites.id, site.id));
  } catch {
    // Don't fail the publish path if the cache write fails.
  }
  return fetched;
}

/**
 * Same as getCapabilities but skips the DB cache. Useful for the "Test
 * connection" flow where the user wants an immediate fresh read.
 */
export async function refreshCapabilities(
  site: CapabilitiesSiteRow,
  apiKey?: string
): Promise<CmsCapabilities> {
  if (site.kind !== "pinterest-cms") return DEFAULT_CAPABILITIES;
  const fetched = await probeCapabilities(site.apiBaseUrl, apiKey);
  try {
    await db
      .update(sites)
      .set({
        capabilitiesCache: fetched,
        capabilitiesCheckedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(sites.id, site.id));
  } catch {
    /* swallow */
  }
  return fetched;
}

async function probeCapabilities(
  apiBaseUrl: string,
  apiKey?: string
): Promise<CmsCapabilities> {
  const url = `${apiBaseUrl.replace(/\/$/, "")}/capabilities`;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 5_000);
    const headers: Record<string, string> = {};
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const res = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    clearTimeout(t);
    if (res.status === 404) return DEFAULT_CAPABILITIES;
    if (!res.ok) return DEFAULT_CAPABILITIES;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("application/json")) return DEFAULT_CAPABILITIES;
    const body = (await res.json()) as unknown;
    return normalizeCapabilities(body) ?? DEFAULT_CAPABILITIES;
  } catch {
    return DEFAULT_CAPABILITIES;
  }
}

/** Normalize a Date-or-string-or-null into epoch ms (or null). */
function toEpochMs(d: Date | string | null | undefined): number | null {
  if (!d) return null;
  if (d instanceof Date) return d.getTime();
  const parsed = Date.parse(d);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseCachedCapabilities(raw: unknown): CmsCapabilities | null {
  if (!raw || typeof raw !== "object") return null;
  return normalizeCapabilities(raw);
}

function normalizeCapabilities(raw: unknown): CmsCapabilities | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const version = typeof obj.version === "string" ? obj.version : "0";
  const features: Record<string, boolean | undefined> = {};
  if (obj.features && typeof obj.features === "object") {
    for (const [k, v] of Object.entries(obj.features as Record<string, unknown>)) {
      if (typeof v === "boolean") features[k] = v;
    }
  }
  const limits: Record<string, number> = {};
  if (obj.limits && typeof obj.limits === "object") {
    for (const [k, v] of Object.entries(obj.limits as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v)) limits[k] = v;
    }
  }
  return { version, features, limits };
}
