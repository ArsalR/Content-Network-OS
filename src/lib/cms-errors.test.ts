import { describe, it, expect } from "vitest";
import {
  mapCmsErrorCode,
  CnosCmsError,
  SlugConflictError,
  RateLimitedError,
  ValidationError,
  AuthError,
} from "./cms-errors";

describe("mapCmsErrorCode", () => {
  it.each([
    ["slug_conflict", SlugConflictError, "slug_conflict"],
    ["post_slug_conflict", SlugConflictError, "slug_conflict"],
    ["rate_limited", RateLimitedError, "rate_limited"],
    ["rate_limit_exceeded", RateLimitedError, "rate_limited"],
    ["validation", ValidationError, "validation"],
    ["invalid_body", ValidationError, "validation"],
    ["validation_error", ValidationError, "validation"],
    ["auth_invalid_key", AuthError, "auth_invalid_key"],
    ["invalid_api_key", AuthError, "auth_invalid_key"],
    ["auth_insufficient_permission", AuthError, "auth_insufficient_permission"],
    ["insufficient_permission", AuthError, "auth_insufficient_permission"],
  ])("maps %s → %s (code=%s)", (code, ctor, expectedCode) => {
    const err = mapCmsErrorCode(code, "msg");
    expect(err).toBeInstanceOf(ctor);
    expect(err).toBeInstanceOf(CnosCmsError);
    expect(err.code).toBe(expectedCode);
  });

  it("falls through to generic unknown for an unrecognized code", () => {
    const err = mapCmsErrorCode("totally_made_up_code", "weird");
    expect(err).toBeInstanceOf(CnosCmsError);
    expect(err).not.toBeInstanceOf(SlugConflictError);
    expect(err.code).toBe("unknown");
    expect(err.message).toBe("weird");
  });

  it("falls through to unknown when code is null/undefined", () => {
    expect(mapCmsErrorCode(null, "x").code).toBe("unknown");
    expect(mapCmsErrorCode(undefined, "x").code).toBe("unknown");
  });

  it("threads opts through to the typed error", () => {
    const err = mapCmsErrorCode("rate_limited", "slow down", {
      httpStatus: 429,
      retryAfterSeconds: 7,
    });
    expect(err).toBeInstanceOf(RateLimitedError);
    expect(err.httpStatus).toBe(429);
    expect(err.retryAfterSeconds).toBe(7);
  });
});
