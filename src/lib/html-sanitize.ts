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

/**
 * Sanitize a string of HTML for storage / transmission to the CMS.
 * Returns the cleaned HTML. Empty / null / undefined input returns "".
 */
export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return "";
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ALLOWED_ATTRS,
    // Force every <a> with target="_blank" to have safe rel.
    ADD_ATTR: ["target"],
    // Strip data:/javascript:/vbscript: URLs in href/src
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|ftp|sftp):|\/|#|\?)/i,
    // Drop the wrapping element when no allowed tag matches — return the text.
    KEEP_CONTENT: true,
    // Don't return DOM; we want a string for Postgres / HTTP body.
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
  });
}
