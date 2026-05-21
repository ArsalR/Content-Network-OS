/**
 * Pinterest image-dimension validation.
 *
 * Pinterest rewards vertical 2:3 imagery. We accept anything between
 * 1.45 and 1.6 in the height:width ratio (≈2:3 ±5%) AND at least 800px
 * wide. Both image-gen output and the cover-at-publish-time checks call
 * `validatePinterestDimensions` so the rules live in exactly one place.
 */

import imageSize from "image-size";

export const PINTEREST_TARGET_HEIGHT_TO_WIDTH_RATIO = 1.5; // 3:2 vertical = h/w = 1.5
export const PINTEREST_RATIO_TOLERANCE = 0.05; // ±5%
export const PINTEREST_MIN_WIDTH = 800;

/** Result type — `ok` carries the parsed dimensions for callers that want them. */
export type ValidationResult =
  | { ok: true; width: number; height: number }
  | { ok: false; error: string; width?: number; height?: number };

/**
 * Validate that the given image buffer is acceptable for a Pinterest pin.
 *
 *   - Aspect ratio (height / width) within ±5% of 1.5 (i.e. 2:3 vertical)
 *   - Width >= 800px so the pin doesn't render blurry in the feed
 *
 * Uses `image-size` which only reads the file header — fast and stable.
 */
export function validatePinterestDimensions(buffer: Buffer): ValidationResult {
  let width = 0;
  let height = 0;
  try {
    const dims = imageSize(buffer);
    width = dims.width ?? 0;
    height = dims.height ?? 0;
  } catch (err) {
    return {
      ok: false,
      error: `Could not read image dimensions: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }

  if (!width || !height) {
    return { ok: false, error: "Could not determine image dimensions", width, height };
  }

  if (width < PINTEREST_MIN_WIDTH) {
    return {
      ok: false,
      error: `Pinterest cover image must be at least ${PINTEREST_MIN_WIDTH}px wide (got ${width}px).`,
      width,
      height,
    };
  }

  const ratio = height / width;
  const lo = PINTEREST_TARGET_HEIGHT_TO_WIDTH_RATIO * (1 - PINTEREST_RATIO_TOLERANCE);
  const hi = PINTEREST_TARGET_HEIGHT_TO_WIDTH_RATIO * (1 + PINTEREST_RATIO_TOLERANCE);
  if (ratio < lo || ratio > hi) {
    const direction = ratio < 1 ? "too horizontal" : ratio < lo ? "too square" : "too tall";
    return {
      ok: false,
      error: `Pinterest cover image must be vertical 2:3 ±5% (1.42–1.58 height/width). Got ${width}×${height} (ratio ${ratio.toFixed(
        2
      )}, ${direction}).`,
      width,
      height,
    };
  }

  return { ok: true, width, height };
}
