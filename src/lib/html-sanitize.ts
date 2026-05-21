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
 * stripped.
 *
 * A DOMPurify `afterSanitizeAttributes` hook upgrades every
 * `<a target="_blank">` to also carry `rel="noopener noreferrer"` to close
 * the reverse-tabnabbing vector.
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
  // Video kept off-by-default per the brief; uncomment when needed.
  // "video", "track",
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

// URL schemes we allow in href/src. Note: NO data:, NO blob:, NO javascript:,
// NO vbscript:. Keep this aligned with the comment that motivates it.
const ALLOWED_URI_REGEXP = /^(?:(?:https?|mailto|tel):|\/|#|\?)/i;

// Install the hook once on module load. DOMPurify hooks are global per
// instance, and isomorphic-dompurify reuses the same instance.
let hooksInstalled = false;
function ensureHooks() {
  if (hooksInstalled) return;
  hooksInstalled = true;
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    // Force every external link to be safe: rel="noopener noreferrer".
    // Anchors with target="_blank" without noopener allow the new page to
    // navigate window.opener — reverse tabnabbing.
    if (node.tagName !== "A") return;
    const el = node as Element;
    const target = el.getAttribute("target");
    if (target === "_blank") {
      const rel = (el.getAttribute("rel") ?? "").toLowerCase();
      const tokens = new Set(rel.split(/\s+/).filter(Boolean));
      tokens.add("noopener");
      tokens.add("noreferrer");
      el.setAttribute("rel", Array.from(tokens).join(" "));
    }
  });
}

/**
 * Sanitize a string of HTML for storage / transmission to the CMS.
 * Returns the cleaned HTML. Empty / null / undefined input returns "".
 */
export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return "";
  ensureHooks();
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ALLOWED_ATTRS,
    ALLOWED_URI_REGEXP,
    // Drop the wrapping element when no allowed tag matches — return the text.
    KEEP_CONTENT: true,
    // Don't return DOM; we want a string for Postgres / HTTP body.
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
  });
}
