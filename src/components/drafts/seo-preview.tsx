"use client";

import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";

interface SeoPreviewProps {
  title: string;
  excerpt: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  slug: string;
  coverImageUrl: string | null;
  siteHostname: string | null;
}

const TITLE_PINTEREST_LIMIT = 100;
const SEO_TITLE_RECOMMENDED = 60;
const SEO_DESC_RECOMMENDED = 160;

export function SeoPreview({
  title,
  excerpt,
  seoTitle,
  seoDescription,
  slug,
  coverImageUrl,
  siteHostname,
}: SeoPreviewProps) {
  const [open, setOpen] = useState(false);

  // Compute the resolved (post-publish) values using the same fall-through
  // chain the cms-client adapter uses, so the preview reflects what will
  // actually be sent to the CMS.
  const resolvedSeoTitle = seoTitle?.trim() || title;
  const resolvedSeoDescription =
    seoDescription?.trim() || excerpt?.trim() || "";
  const hostnameForUrl = siteHostname || "yoursite.com";
  const previewUrl = `${hostnameForUrl.replace(/^https?:\/\//, "")}/${slug || "your-post"}`;

  // Warnings collected so we can show a compact summary next to the toggle.
  const warnings: string[] = [];
  if (!coverImageUrl) warnings.push("Cover image missing — Pinterest pin won't render");
  if (!seoTitle && !title) warnings.push("Title missing");
  if (!seoDescription && !excerpt) warnings.push("Description missing");
  if (resolvedSeoTitle.length > SEO_TITLE_RECOMMENDED)
    warnings.push(`SEO title ${resolvedSeoTitle.length} chars (recommended ≤ ${SEO_TITLE_RECOMMENDED})`);
  if (resolvedSeoDescription.length > SEO_DESC_RECOMMENDED)
    warnings.push(`SEO description ${resolvedSeoDescription.length} chars (recommended ≤ ${SEO_DESC_RECOMMENDED})`);
  if (title.length > TITLE_PINTEREST_LIMIT)
    warnings.push(`Title ${title.length} chars (Pinterest cuts at ${TITLE_PINTEREST_LIMIT})`);

  return (
    <div className="border-t border-border pt-4 space-y-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
      >
        <span className="flex items-center gap-1.5">
          {open ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          SEO Preview
        </span>
        {warnings.length > 0 && (
          <span className="flex items-center gap-1 text-amber-500 normal-case font-normal text-[11px]">
            <AlertTriangle className="h-3 w-3" />
            {warnings.length} {warnings.length === 1 ? "issue" : "issues"}
          </span>
        )}
      </button>

      {open && (
        <div className="space-y-4">
          {/* Google search snippet */}
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Google search result
            </p>
            <div className="rounded-md border border-border bg-white p-3 text-sm shadow-sm">
              <div className="text-xs text-gray-600 truncate">{previewUrl}</div>
              <div className="mt-0.5 text-base text-blue-800 leading-tight line-clamp-1">
                {resolvedSeoTitle || (
                  <span className="italic text-gray-400">No title</span>
                )}
              </div>
              <div className="mt-1 text-xs text-gray-700 line-clamp-2 leading-snug">
                {resolvedSeoDescription || (
                  <span className="italic text-gray-400">
                    No description — fill in SEO Description or Excerpt
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Pinterest pin preview */}
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Pinterest pin
            </p>
            <div className="rounded-xl border border-border bg-zinc-900 p-2 shadow-sm">
              {coverImageUrl ? (
                <div
                  className="w-full rounded-lg bg-cover bg-center"
                  style={{
                    backgroundImage: `url('${coverImageUrl}')`,
                    aspectRatio: "2 / 3",
                    minHeight: 120,
                  }}
                />
              ) : (
                <div className="flex aspect-[2/3] min-h-[120px] w-full items-center justify-center rounded-lg border-2 border-dashed border-zinc-700 text-xs text-zinc-500">
                  No cover image
                </div>
              )}
              <div className="mt-2 px-1 text-sm font-medium text-zinc-100 line-clamp-2">
                {title || (
                  <span className="italic text-zinc-500">No title</span>
                )}
              </div>
            </div>
          </div>

          {/* Warnings list */}
          {warnings.length > 0 && (
            <ul className="space-y-1 rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-[11px] text-amber-300">
              {warnings.map((w, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-0.5" />
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
