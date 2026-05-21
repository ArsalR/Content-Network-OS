"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  moveDraftToReview,
  approveDraft,
  rejectDraft,
  scheduleDraft,
  unscheduleDraft,
  publishDraftNow,
} from "@/actions/drafts";
import { CoverImagePicker } from "./cover-image-picker";
import { SeoPreview } from "./seo-preview";

type DraftStatus =
  | "generating"
  | "draft"
  | "review"
  | "approved"
  | "scheduled"
  | "publishing"
  | "published"
  | "failed";

interface Site {
  id: string;
  name: string;
  hostname?: string;
}

interface EditorSidebarProps {
  draftId: string;
  status: DraftStatus;
  title: string;
  slug: string;
  excerpt: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  seoKeywords: string | null;
  coverImageUrl: string | null;
  coverImageAlt: string | null;
  targetSiteId: string | null;
  targetCategory: string | null;
  sites: Site[];
  onFieldChange: (field: string, value: string) => void;
  // Phase 3: surface publish attempts + last failure info when status=failed
  publishAttempts?: number;
  failureReason?: string | null;
  failureCode?: string | null;
}

const STATUS_COLORS: Record<DraftStatus, string> = {
  generating: "border-transparent bg-yellow-800 text-yellow-200",
  draft: "border-transparent bg-zinc-700 text-zinc-200",
  review: "border-transparent bg-blue-800 text-blue-200",
  approved: "border-transparent bg-green-800 text-green-200",
  scheduled: "border-transparent bg-purple-800 text-purple-200",
  publishing: "border-transparent bg-orange-800 text-orange-200",
  published: "border-transparent bg-teal-800 text-teal-200",
  failed: "border-transparent bg-red-800 text-red-200",
};

export function EditorSidebar({
  draftId,
  status,
  title,
  slug,
  excerpt,
  seoTitle,
  seoDescription,
  seoKeywords,
  coverImageUrl,
  coverImageAlt,
  targetSiteId,
  targetCategory,
  sites,
  onFieldChange,
  publishAttempts,
  failureReason,
  failureCode,
}: EditorSidebarProps) {
  const [isPending, startTransition] = useTransition();
  const [scheduleDate, setScheduleDate] = useState("");

  function handleAction(
    fn: () => Promise<{ ok: true } | { ok: false; error: string }>,
    successMsg: string
  ) {
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        toast.success(successMsg);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4 overflow-y-auto h-full pr-1">
      {/* Status */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Status
        </span>
        <Badge className={STATUS_COLORS[status]}>{status}</Badge>
      </div>

      {/* Publish failure surface — shown on the 'failed' status so the user
          can see what went wrong, how many times we've tried, and the typed
          CMS error code (when features.error_codes is on). */}
      {status === "failed" && (failureReason || publishAttempts) && (
        <div className="rounded-md border border-red-500/30 bg-red-500/5 p-2.5 space-y-1 text-xs">
          {failureReason && (
            <div className="text-red-300 break-words leading-snug">{failureReason}</div>
          )}
          <div className="flex items-center gap-2 text-muted-foreground">
            {typeof publishAttempts === "number" && publishAttempts > 0 && (
              <span>
                Attempt {publishAttempts}/5
              </span>
            )}
            {failureCode && (
              <span className="rounded bg-red-500/20 px-1.5 py-0.5 font-mono text-[10px] text-red-200">
                {failureCode}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Title */}
      <div className="space-y-1.5">
        <Label htmlFor="sidebar-title" className="text-xs text-muted-foreground">
          Title
        </Label>
        <Input
          id="sidebar-title"
          value={title}
          onChange={(e) => onFieldChange("title", e.target.value)}
          className="text-sm h-8"
        />
      </div>

      {/* Slug */}
      <div className="space-y-1.5">
        <Label htmlFor="sidebar-slug" className="text-xs text-muted-foreground">
          Slug
        </Label>
        <Input
          id="sidebar-slug"
          value={slug}
          onChange={(e) => onFieldChange("slug", e.target.value)}
          className="text-sm h-8 font-mono"
        />
      </div>

      {/* Excerpt */}
      <div className="space-y-1.5">
        <Label htmlFor="sidebar-excerpt" className="text-xs text-muted-foreground">
          Excerpt
        </Label>
        <Textarea
          id="sidebar-excerpt"
          value={excerpt ?? ""}
          onChange={(e) => onFieldChange("excerpt", e.target.value)}
          className="text-sm min-h-[64px] resize-none"
          rows={3}
        />
      </div>

      {/* SEO */}
      <div className="border-t border-border pt-4 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          SEO
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="sidebar-seo-title" className="text-xs text-muted-foreground">
            SEO Title
          </Label>
          <Input
            id="sidebar-seo-title"
            value={seoTitle ?? ""}
            onChange={(e) => onFieldChange("seoTitle", e.target.value)}
            className="text-sm h-8"
            maxLength={80}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sidebar-seo-desc" className="text-xs text-muted-foreground">
            SEO Description
          </Label>
          <Textarea
            id="sidebar-seo-desc"
            value={seoDescription ?? ""}
            onChange={(e) => onFieldChange("seoDescription", e.target.value)}
            className="text-sm min-h-[56px] resize-none"
            rows={2}
            maxLength={200}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sidebar-seo-keywords" className="text-xs text-muted-foreground">
            SEO Keywords
          </Label>
          <Input
            id="sidebar-seo-keywords"
            value={seoKeywords ?? ""}
            onChange={(e) => onFieldChange("seoKeywords", e.target.value)}
            className="text-sm h-8"
          />
        </div>
      </div>

      {/* SEO Preview — what it'll look like on Google and Pinterest */}
      <SeoPreview
        title={title}
        excerpt={excerpt}
        seoTitle={seoTitle}
        seoDescription={seoDescription}
        slug={slug}
        coverImageUrl={coverImageUrl}
        siteHostname={sites.find((s) => s.id === targetSiteId)?.hostname ?? null}
      />

      {/* Cover Image */}
      <div className="border-t border-border pt-4 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Cover Image
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="sidebar-cover-url" className="text-xs text-muted-foreground">
            Image URL
          </Label>
          <Input
            id="sidebar-cover-url"
            value={coverImageUrl ?? ""}
            onChange={(e) => onFieldChange("coverImageUrl", e.target.value)}
            className="text-sm h-8"
            placeholder="https://..."
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sidebar-cover-alt" className="text-xs text-muted-foreground">
            Alt Text
          </Label>
          <Input
            id="sidebar-cover-alt"
            value={coverImageAlt ?? ""}
            onChange={(e) => onFieldChange("coverImageAlt", e.target.value)}
            className="text-sm h-8"
          />
        </div>
        <CoverImagePicker onSelect={(url) => onFieldChange("coverImageUrl", url)} />
      </div>

      {/* Publishing */}
      <div className="border-t border-border pt-4 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Publishing
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="sidebar-site" className="text-xs text-muted-foreground">
            Target Site
          </Label>
          <Select
            value={targetSiteId ?? "none"}
            onValueChange={(val) =>
              onFieldChange("targetSiteId", val === "none" ? "" : val)
            }
          >
            <SelectTrigger id="sidebar-site" className="h-8 text-sm">
              <SelectValue placeholder="Select site..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {sites.map((site) => (
                <SelectItem key={site.id} value={site.id}>
                  {site.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sidebar-category" className="text-xs text-muted-foreground">
            Category
          </Label>
          <Input
            id="sidebar-category"
            value={targetCategory ?? ""}
            onChange={(e) => onFieldChange("targetCategory", e.target.value)}
            className="text-sm h-8"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="border-t border-border pt-4 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Actions
        </p>

        {status === "draft" && (
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            disabled={isPending}
            onClick={() =>
              handleAction(() => moveDraftToReview(draftId), "Moved to review")
            }
          >
            Move to Review
          </Button>
        )}

        {status === "review" && (
          <div className="flex flex-col gap-2">
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              disabled={isPending}
              onClick={() =>
                handleAction(() => approveDraft(draftId), "Draft approved")
              }
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="w-full text-red-400 hover:text-red-300"
              disabled={isPending}
              onClick={() =>
                handleAction(() => rejectDraft(draftId), "Draft rejected")
              }
            >
              Reject
            </Button>
          </div>
        )}

        {status === "approved" && (
          <div className="flex flex-col gap-2">
            <Input
              type="datetime-local"
              value={scheduleDate}
              onChange={(e) => setScheduleDate(e.target.value)}
              className="text-sm h-8"
            />
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              disabled={isPending || !scheduleDate}
              onClick={() =>
                handleAction(
                  () => scheduleDraft(draftId, new Date(scheduleDate).toISOString()),
                  "Draft scheduled"
                )
              }
            >
              Schedule
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  const result = await publishDraftNow(draftId);
                  if (result.ok) {
                    toast.success("Publishing queued!");
                    window.location.reload();
                  } else {
                    toast.error(result.error);
                  }
                })
              }
            >
              {isPending ? "Publishing…" : "Publish Now"}
            </Button>
          </div>
        )}

        {status === "scheduled" && (
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            disabled={isPending}
            onClick={() =>
              handleAction(() => unscheduleDraft(draftId), "Schedule cancelled")
            }
          >
            Cancel Schedule
          </Button>
        )}
      </div>
    </div>
  );
}
