/**
 * HTML sanitization for post bodies.
 *
 * Pinterest CMS stores `content` as raw HTML and does NOT sanitize on
 * render. Sanitize at the source instead: on draft save and again at
 * publish time as a defence-in-depth. Sanitize once per write — not on
 * render — so the stored data is already safe.
 *
 * Strict allow-list mirrors the Tiptap-generated tag set plus the tags
 * the editor's content can plausibly carry (figures, gallery images, etc).
 * Anything not on the list (script, iframe, style, on* attributes, etc) is
 * stripped. DOMPurify's default URI handling blocks `javascript:` and
 * `vbscript:`; we add an explicit post-processing pass to strip `data:`
 * and `blob:` URLs from `href` / `src` because DOMPurify trusts data:
 * URLs for images by default.
 *
 * `target="_blank"` links automatically get `rel="noopener noreferrer"`
 * injected (via pre-processing, since DOMPurify drops `target` when
 * `ALLOWED_URI_REGEXP` is configured — setting that option turns out to
 * also strip non-URI attrs like `target` and `rel`, so we rely on
 * defaults and pre/post-process for safety).
 */

import DOMPurify from "isomorphic-dompurify";

const ALLOWED_TAGS: string[] = [
  // Block
  "p", "div", "section", "article", "header", "footer", "main", "aside",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li",
  "blockquote", "pre", "code",
  "hr",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td",
  // Inline
  "a", "strong", "b", "em", "i", "u", "s", "del", "ins", "small", "sub", "sup",
  "br", "span", "mark",
  // Media
  "img", "figure", "figcaption", "picture", "source",
];

const ALLOWED_ATTRS: string[] = [
  // Links
  "href", "title", "rel", "target",
  // Images
  "src", "alt", "width", "height", "loading", "decoding",
  // Tables
  "colspan", "rowspan", "scope",
  // Generic
  "class", "id",
  // <source> for <picture>
  "srcset", "sizes", "type",
];

/** URL schemes we explicitly strip after sanitize. */
const FORBIDDEN_URI_SCHEMES = /^\s*(?:data|blob|javascript|vbscript|file):/i;

/**
 * Pre-process HTML before sanitize: every `<a target="_blank">` gets
 * `rel="noopener noreferrer"` added (merging into any existing rel).
 * Doing this BEFORE sanitize means the rel attribute is already in place
 * and DOMPurify simply keeps it. Reverse-tabnabbing mitigation.
 */
function injectSafeRelForBlankTargets(html: string): string {
  if (!html.toLowerCase().includes("target")) return html;
  return html.replace(
    /<a\b([^>]*\btarget\s*=\s*["']?_blank["']?[^>]*)>/gi,
    (_full: string, attrs: string) => {
      const relMatch = /\brel\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i.exec(attrs);
      const existingRel = relMatch ? relMatch[1].replace(/^['"]|['"]$/g, "") : "";
      const tokens = new Set(
        existingRel.toLowerCase().split(/\s+/).filter(Boolean)
      );
      tokens.add("noopener");
      tokens.add("noreferrer");
      const merged = Array.from(tokens).join(" ");
      const nextAttrs = relMatch
        ? attrs.replace(relMatch[0], `rel="${merged}"`)
        : `${attrs} rel="${merged}"`;
      return `<a${nextAttrs}>`;
    }
  );
}

/**
 * Post-process the sanitized HTML to strip any remaining data:/blob:/etc
 * URLs from href/src/srcset. DOMPurify trusts data:image/* URLs by
 * default, but the brief requires that data: URLs never reach the CMS.
 *
 * For `src` / `href`: drop the entire attribute if the value uses a
 * forbidden scheme.
 *
 * For `srcset` (comma-separated `url [descriptor]` pairs): drop any
 * candidate whose URL uses a forbidden scheme; drop the whole attribute
 * if no safe candidates remain.
 */
function stripUnsafeUrlSchemes(html: string): string {
  // src / href: tolerant attribute parser (quoted or unquoted).
  let out = html.replace(
    /\s(src|href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
    (
      full: string,
      _name: string,
      dq: string | undefined,
      sq: string | undefined,
      uq: string | undefined
    ) => {
      const value: string = (dq ?? sq ?? uq ?? "").trim();
      if (FORBIDDEN_URI_SCHEMES.test(value)) return "";
      return full;
    }
  );

  // srcset: parse the comma-separated candidate list and drop any
  // candidate whose URL portion uses a forbidden scheme. If no safe
  // candidates remain, drop the whole attribute.
  out = out.replace(
    /\ssrcset\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
    (
      _full: string,
      dq: string | undefined,
      sq: string | undefined,
      uq: string | undefined
    ) => {
      const raw: string = (dq ?? sq ?? uq ?? "").trim();
      if (!raw) return "";
      const safe = raw
        .split(",")
        .map((c: string) => c.trim())
        .filter((c: string) => c.length > 0)
        .filter((candidate: string) => {
          // Each candidate is "url [descriptor]" — URL is the first
          // whitespace-delimited token.
          const url = candidate.split(/\s+/)[0] ?? "";
          return !FORBIDDEN_URI_SCHEMES.test(url);
        });
      if (safe.length === 0) return "";
      return ` srcset="${safe.join(", ")}"`;
    }
  );

  return out;
}

/**
 * Sanitize a string of HTML for storage / transmission to the CMS.
 * Returns the cleaned HTML. Empty / null / undefined input returns "".
 */
export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return "";
  const preprocessed = injectSafeRelForBlankTargets(html);
  const sanitized = DOMPurify.sanitize(preprocessed, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ALLOWED_ATTRS,
    // Drop the wrapping element when no allowed tag matches — return the text.
    KEEP_CONTENT: true,
    // Don't return DOM; we want a string for Postgres / HTTP body.
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
  });
  return stripUnsafeUrlSchemes(sanitized);
}
