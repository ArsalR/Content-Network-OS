/**
 * Stripe-style webhook signature verification.
 *
 * Header format:  X-CMS-Signature: t=<unix>,v1=<hex hmac-sha256>
 * Signed payload: `${t}.${rawBody}`
 * Algorithm:      HMAC-SHA256 with the per-site secret captured at
 *                 webhook registration time.
 *
 * 5-minute replay window: timestamps older than 5 min from "now" are
 * rejected as a defence against captured-and-replayed deliveries.
 *
 * Pure functions only — no DB, no fetch. Importable from edge & node.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export const WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 300;

export type SignatureVerificationResult =
  | { ok: true; timestamp: number }
  | { ok: false; reason: string };

/**
 * Parse a header value like `t=1716295200,v1=abcdef...` into its parts.
 * Returns null if the header is malformed.
 */
export function parseSignatureHeader(
  header: string | null | undefined
): { t: number; v1: string } | null {
  if (!header) return null;
  const parts = header.split(",").map((p) => p.trim());
  let t: number | null = null;
  let v1: string | null = null;
  for (const part of parts) {
    const [k, v] = part.split("=", 2);
    if (k === "t") {
      const n = Number(v);
      if (Number.isFinite(n)) t = n;
    } else if (k === "v1") {
      v1 = v;
    }
  }
  if (t === null || !v1) return null;
  return { t, v1 };
}

/**
 * Compute the expected v1 signature for the given (timestamp, body, secret).
 * Returned as lowercase hex.
 */
export function computeExpectedSignature(
  timestamp: number,
  rawBody: string,
  secret: string
): string {
  const payload = `${timestamp}.${rawBody}`;
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

/**
 * Verify a CMS webhook signature header against the raw request body using
 * the per-site secret. Returns { ok: true, timestamp } on valid, or
 * { ok: false, reason } with a stable machine-readable reason on rejection.
 */
export function verifyWebhookSignature(
  rawBody: string,
  header: string | null | undefined,
  secret: string,
  now: Date = new Date()
): SignatureVerificationResult {
  const parsed = parseSignatureHeader(header);
  if (!parsed) {
    return { ok: false, reason: "missing_or_malformed_signature_header" };
  }

  // 5-minute replay window. Reject early (cheap) before HMAC compare.
  const ageSeconds = Math.floor(now.getTime() / 1000) - parsed.t;
  if (Math.abs(ageSeconds) > WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS) {
    return { ok: false, reason: "timestamp_outside_tolerance" };
  }

  const expected = computeExpectedSignature(parsed.t, rawBody, secret);

  // timingSafeEqual requires equal-length buffers; bail early if the hex
  // strings differ in length to avoid throwing.
  if (expected.length !== parsed.v1.length) {
    return { ok: false, reason: "signature_mismatch" };
  }

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(parsed.v1, "utf8");
  if (!timingSafeEqual(a, b)) {
    return { ok: false, reason: "signature_mismatch" };
  }

  return { ok: true, timestamp: parsed.t };
}
