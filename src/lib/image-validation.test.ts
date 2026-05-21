import { describe, it, expect } from "vitest";
import { validatePinterestDimensions } from "./image-validation";

/**
 * Build a minimal PNG buffer with the given dimensions. We only need the
 * 8-byte signature + IHDR chunk — `image-size` reads dimensions from the
 * IHDR and doesn't validate the CRC, so the rest of the file is irrelevant.
 */
function fakePng(width: number, height: number): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(25);
  // length = 13 (data bytes)
  ihdr.writeUInt32BE(13, 0);
  ihdr.write("IHDR", 4);
  ihdr.writeUInt32BE(width, 8);
  ihdr.writeUInt32BE(height, 12);
  ihdr[16] = 8; // bit depth
  ihdr[17] = 2; // colour type (RGB)
  ihdr[18] = 0; // compression
  ihdr[19] = 0; // filter
  ihdr[20] = 0; // interlace
  // CRC (4 bytes) — image-size doesn't validate, leave zero
  ihdr.writeUInt32BE(0, 21);
  return Buffer.concat([sig, ihdr]);
}

describe("validatePinterestDimensions", () => {
  describe("accepts", () => {
    it.each([
      ["exact 1000×1500 (2:3)", 1000, 1500],
      ["1024×1536 (DALL-E 3 vertical)", 1024, 1536],
      ["1024×1792 (DALL-E close-2:3)", 1024, 1792],
      ["large 2:3 (2000×3000)", 2000, 3000],
      ["just inside the ratio tolerance — ratio 1.45", 1000, 1450],
      ["just inside the ratio tolerance — ratio 1.575", 800, 1260],
    ])("%s", (_label, w, h) => {
      const res = validatePinterestDimensions(fakePng(w, h));
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.width).toBe(w);
        expect(res.height).toBe(h);
      }
    });
  });

  describe("rejects", () => {
    it.each([
      ["square 1000×1000", 1000, 1000, "vertical"],
      ["landscape 1500×1000", 1500, 1000, "horizontal"],
      ["too small width 799×1199", 799, 1199, "800"],
      ["near-square 1000×1100", 1000, 1100, "vertical"],
      ["too tall 1000×2000 (h/w=2.0)", 1000, 2000, "too tall"],
    ])("%s", (_label, w, h, expectedFragment) => {
      const res = validatePinterestDimensions(fakePng(w, h));
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.toLowerCase()).toContain(expectedFragment.toLowerCase());
      }
    });
  });

  describe("handles bad input", () => {
    it("returns an error for an unrecognised buffer", () => {
      const res = validatePinterestDimensions(Buffer.from("not an image"));
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.toLowerCase()).toMatch(/(could not|invalid|unreadable|determine)/);
      }
    });

    it("returns an error for an empty buffer", () => {
      const res = validatePinterestDimensions(Buffer.alloc(0));
      expect(res.ok).toBe(false);
    });
  });
});
