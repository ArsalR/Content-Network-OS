import { describe, it, expect } from "vitest";
import { sanitizeHtml } from "./html-sanitize";

describe("sanitizeHtml", () => {
  describe("empty input", () => {
    it.each([
      ["null", null],
      ["undefined", undefined],
      ["empty string", ""],
    ])("returns empty string for %s", (_label, input) => {
      expect(sanitizeHtml(input)).toBe("");
    });
  });

  describe("allows safe content", () => {
    it("keeps standard block + inline tags", () => {
      const html =
        "<p><strong>Hello</strong> <em>world</em></p>" +
        "<h2>Heading</h2><ul><li>One</li></ul>";
      const out = sanitizeHtml(html);
      expect(out).toContain("<p>");
      expect(out).toContain("<strong>Hello</strong>");
      expect(out).toContain("<em>world</em>");
      expect(out).toContain("<h2>Heading</h2>");
      expect(out).toContain("<ul>");
      expect(out).toContain("<li>One</li>");
    });

    it("keeps img with src + alt", () => {
      const out = sanitizeHtml(
        '<img src="https://example.com/x.png" alt="Hi">'
      );
      expect(out).toContain('src="https://example.com/x.png"');
      expect(out).toContain('alt="Hi"');
    });

    it("keeps a href safe http/https/mailto/tel", () => {
      expect(sanitizeHtml('<a href="https://ok.com">x</a>')).toContain('href="https://ok.com"');
      expect(sanitizeHtml('<a href="http://ok.com">x</a>')).toContain('href="http://ok.com"');
      expect(sanitizeHtml('<a href="mailto:a@b.com">x</a>')).toContain("mailto:");
      expect(sanitizeHtml('<a href="tel:+15551234">x</a>')).toContain("tel:");
    });
  });

  describe("XSS attack table", () => {
    it.each([
      // [label, input, banned-substring(s)]
      ["bare <script>", '<script>alert(1)</script>', "<script"],
      ["script via attribute close", '<img src=x onerror="alert(1)">', "onerror"],
      ["javascript: URL on a", '<a href="javascript:alert(1)">x</a>', "javascript:"],
      ["data: URL on img", '<img src="data:text/html;base64,PHNjcmlwdD4=">', "data:"],
      ["vbscript: URL", '<a href="vbscript:msgbox(1)">x</a>', "vbscript:"],
      ["iframe", '<iframe src="https://evil.com"></iframe>', "<iframe"],
      ["style tag", '<style>body{display:none}</style>', "<style"],
      ["onload handler on body-ish content", '<div onload="alert(1)">x</div>', "onload"],
      ["onclick on div", '<div onclick="alert(1)">x</div>', "onclick"],
      ["svg onload", '<svg onload="alert(1)"></svg>', "onload"],
    ])("strips %s", (_label, input, banned) => {
      const out = sanitizeHtml(input).toLowerCase();
      expect(out).not.toContain(banned.toLowerCase());
    });
  });

  describe("srcset stripping", () => {
    it("drops a data: candidate from srcset", () => {
      const out = sanitizeHtml(
        '<img srcset="https://x.com/a.png 1x, data:image/png;base64,zzz 2x">'
      );
      expect(out.toLowerCase()).not.toContain("data:");
      expect(out).toContain("https://x.com/a.png 1x");
    });

    it("drops the whole srcset when every candidate is unsafe", () => {
      const out = sanitizeHtml(
        '<img srcset="data:image/png;base64,a 1x, blob:b 2x">'
      );
      expect(out.toLowerCase()).not.toContain("data:");
      expect(out.toLowerCase()).not.toContain("blob:");
      expect(out.toLowerCase()).not.toContain("srcset");
    });

    it("preserves safe srcset entirely", () => {
      const out = sanitizeHtml(
        '<img srcset="https://x.com/a.png 1x, https://x.com/b.png 2x">'
      );
      expect(out).toContain("srcset=");
      expect(out).toContain("https://x.com/a.png 1x");
      expect(out).toContain("https://x.com/b.png 2x");
    });
  });

  describe("target=_blank rel enforcement", () => {
    it("adds noopener noreferrer when target=_blank is set", () => {
      const out = sanitizeHtml('<a href="https://ok.com" target="_blank">x</a>');
      expect(out).toContain("noopener");
      expect(out).toContain("noreferrer");
    });

    it("preserves an existing rel and appends noopener", () => {
      const out = sanitizeHtml(
        '<a href="https://ok.com" target="_blank" rel="nofollow">x</a>'
      );
      // case-insensitive: token order isn't guaranteed
      expect(out.toLowerCase()).toContain("nofollow");
      expect(out.toLowerCase()).toContain("noopener");
      expect(out.toLowerCase()).toContain("noreferrer");
    });

    it("does NOT touch rel when target is not _blank", () => {
      const out = sanitizeHtml('<a href="https://ok.com">x</a>');
      // No injected rel; the anchor stays clean.
      expect(out).not.toContain("noopener");
      expect(out).not.toContain("noreferrer");
    });
  });
});
