import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import {
  computeExpectedSignature,
  parseSignatureHeader,
  verifyWebhookSignature,
  WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS,
} from "./cms-webhook-signature";

const SECRET = "shhh-this-is-a-test-secret";
const BODY = '{"event":"post.created","data":{"post":{"id":"abc"}}}';

function signedHeader(t: number, body = BODY, secret = SECRET): string {
  const sig = createHmac("sha256", secret).update(`${t}.${body}`, "utf8").digest("hex");
  return `t=${t},v1=${sig}`;
}

describe("parseSignatureHeader", () => {
  it("parses t and v1 from a well-formed header", () => {
    const parsed = parseSignatureHeader("t=1716295200,v1=deadbeef");
    expect(parsed).toEqual({ t: 1716295200, v1: "deadbeef" });
  });

  it("tolerates surrounding whitespace", () => {
    const parsed = parseSignatureHeader("  t=12345 , v1=abc  ");
    expect(parsed?.t).toBe(12345);
    expect(parsed?.v1).toBe("abc");
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["empty", ""],
    ["missing t", "v1=abc"],
    ["missing v1", "t=12345"],
    ["non-numeric t", "t=foo,v1=abc"],
  ])("returns null for %s", (_label, input) => {
    expect(parseSignatureHeader(input)).toBeNull();
  });
});

describe("computeExpectedSignature", () => {
  it("produces a deterministic HMAC-SHA256 hex", () => {
    const sig = computeExpectedSignature(1716295200, BODY, SECRET);
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
    // Same inputs → same output
    expect(computeExpectedSignature(1716295200, BODY, SECRET)).toBe(sig);
  });

  it("changes when any input changes", () => {
    const a = computeExpectedSignature(1, BODY, SECRET);
    const b = computeExpectedSignature(2, BODY, SECRET);
    const c = computeExpectedSignature(1, BODY + " ", SECRET);
    const d = computeExpectedSignature(1, BODY, SECRET + "x");
    expect(new Set([a, b, c, d]).size).toBe(4);
  });
});

describe("verifyWebhookSignature", () => {
  const now = new Date("2026-05-20T12:00:00Z");
  const nowSeconds = Math.floor(now.getTime() / 1000);

  it("accepts a valid signature within the replay window", () => {
    const header = signedHeader(nowSeconds);
    const res = verifyWebhookSignature(BODY, header, SECRET, now);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.timestamp).toBe(nowSeconds);
  });

  it("rejects a stale timestamp (older than tolerance)", () => {
    const stale = nowSeconds - (WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS + 1);
    const header = signedHeader(stale);
    const res = verifyWebhookSignature(BODY, header, SECRET, now);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("timestamp_outside_tolerance");
  });

  it("rejects a far-future timestamp (clock skew defense)", () => {
    const future = nowSeconds + (WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS + 1);
    const header = signedHeader(future);
    const res = verifyWebhookSignature(BODY, header, SECRET, now);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("timestamp_outside_tolerance");
  });

  it("rejects a missing header", () => {
    const res = verifyWebhookSignature(BODY, null, SECRET, now);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("missing_or_malformed_signature_header");
  });

  it("rejects a malformed header", () => {
    const res = verifyWebhookSignature(BODY, "not-a-real-header", SECRET, now);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("missing_or_malformed_signature_header");
  });

  it("rejects when the signature is wrong", () => {
    const header = `t=${nowSeconds},v1=${"0".repeat(64)}`;
    const res = verifyWebhookSignature(BODY, header, SECRET, now);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("signature_mismatch");
  });

  it("rejects when the signature has wrong length (timing-safe path)", () => {
    const header = `t=${nowSeconds},v1=tooshort`;
    const res = verifyWebhookSignature(BODY, header, SECRET, now);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("signature_mismatch");
  });

  it("rejects when the body is modified after signing (integrity)", () => {
    const header = signedHeader(nowSeconds);
    const res = verifyWebhookSignature(BODY + "!", header, SECRET, now);
    expect(res.ok).toBe(false);
  });

  it("rejects when the secret is wrong (auth)", () => {
    const header = signedHeader(nowSeconds);
    const res = verifyWebhookSignature(BODY, header, "different-secret", now);
    expect(res.ok).toBe(false);
  });
});
