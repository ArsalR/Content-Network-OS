/**
 * Typed CMS errors.
 *
 * When the CMS supports `features.error_codes` it returns a snake_case
 * `code` in the body AND an `X-Error-Code` header on 4xx/5xx responses.
 * This module maps those codes to typed CnosCmsError subclasses so the
 * caller can branch on the constructor instead of string matching.
 *
 * When the CMS does NOT support error codes we fall through to plain
 * Error with the human-readable message — callers should still inspect
 * the code field via `instanceof` first.
 */

export type CmsErrorCode =
  // Slug already exists on a different post (POST collision before
  // suffix-reconciliation kicks in)
  | "slug_conflict"
  // 429 from the CMS; carries optional retryAfterSeconds.
  | "rate_limited"
  // Validation failure on the request body (missing title etc).
  | "validation"
  // Bad / missing API key or insufficient permissions.
  | "auth_invalid_key"
  | "auth_insufficient_permission"
  // Any other server-side or unknown error.
  | "unknown";

export class CnosCmsError extends Error {
  public readonly code: CmsErrorCode;
  public readonly httpStatus?: number;
  public readonly retryAfterSeconds?: number;
  public readonly raw?: unknown;

  constructor(
    code: CmsErrorCode,
    message: string,
    opts?: { httpStatus?: number; retryAfterSeconds?: number; raw?: unknown }
  ) {
    super(message);
    this.name = "CnosCmsError";
    this.code = code;
    this.httpStatus = opts?.httpStatus;
    this.retryAfterSeconds = opts?.retryAfterSeconds;
    this.raw = opts?.raw;
  }
}

export class SlugConflictError extends CnosCmsError {
  constructor(message: string, opts?: { httpStatus?: number; raw?: unknown }) {
    super("slug_conflict", message, opts);
    this.name = "SlugConflictError";
  }
}

export class RateLimitedError extends CnosCmsError {
  constructor(
    message: string,
    opts?: { httpStatus?: number; retryAfterSeconds?: number; raw?: unknown }
  ) {
    super("rate_limited", message, opts);
    this.name = "RateLimitedError";
  }
}

export class ValidationError extends CnosCmsError {
  constructor(message: string, opts?: { httpStatus?: number; raw?: unknown }) {
    super("validation", message, opts);
    this.name = "ValidationError";
  }
}

export class AuthError extends CnosCmsError {
  constructor(
    message: string,
    opts?: {
      httpStatus?: number;
      raw?: unknown;
      insufficient?: boolean;
    }
  ) {
    super(opts?.insufficient ? "auth_insufficient_permission" : "auth_invalid_key", message, opts);
    this.name = "AuthError";
  }
}

/**
 * Map a CMS-supplied snake_case error code to a typed CnosCmsError.
 * Any unknown code falls through to a generic CnosCmsError with code="unknown".
 *
 * Codes loosely follow the convention proposed in the brief; the exact
 * shape will be confirmed when the CMS team ships features.error_codes.
 */
export function mapCmsErrorCode(
  code: string | null | undefined,
  message: string,
  opts?: { httpStatus?: number; retryAfterSeconds?: number; raw?: unknown }
): CnosCmsError {
  switch (code) {
    case "slug_conflict":
    case "post_slug_conflict":
      return new SlugConflictError(message, opts);
    case "rate_limited":
    case "rate_limit_exceeded":
      return new RateLimitedError(message, opts);
    case "validation":
    case "invalid_body":
    case "validation_error":
      return new ValidationError(message, opts);
    case "auth_invalid_key":
    case "invalid_api_key":
      return new AuthError(message, { ...opts, insufficient: false });
    case "auth_insufficient_permission":
    case "insufficient_permission":
      return new AuthError(message, { ...opts, insufficient: true });
    default:
      return new CnosCmsError("unknown", message, opts);
  }
}
