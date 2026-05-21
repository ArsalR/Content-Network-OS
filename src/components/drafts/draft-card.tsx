"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCheck, Eye, X, Calendar, AlertCircle, RotateCw } from "lucide-react";
import {
  moveDraftToReview,
  approveDraft,
  rejectDraft,
  publishDraftNow,
} from "@/actions/drafts";

type DraftStatus =
  | "generating"
  | "draft"
  | "review"
  | "approved"
  | "scheduled"
  | "publishing"
  | "published"
  | "failed";

export interface DraftCardProps {
  id: string;
  title: string;
  projectName: string;
  siteName: string | null;
  targetCategory: string | null;
  status: DraftStatus;
  createdAt: Date;
  scheduledFor: Date | null;
  failureReason?: string | null;
  failureCode?: string | null;
  publishAttempts?: number;
  /** True when scheduledFor is within the next hour (set by KanbanBoard). */
  isDueSoon?: boolean;
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

export function DraftCard({
  id,
  title,
  projectName,
  siteName,
  targetCategory,
  status,
  createdAt,
  scheduledFor,
  failureReason,
  failureCode,
  publishAttempts,
  isDueSoon,
}: DraftCardProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleAction(fn: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error);
    });
  }

  function handleRetry() {
    setError(null);
    startTransition(async () => {
      const result = await publishDraftNow(id);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div
      className={`rounded-md border p-3 space-y-2 transition-colors ${
        isDueSoon
          ? "border-purple-500/50 bg-purple-500/5"
          : status === "failed"
            ? "border-red-500/40 bg-red-500/5"
            : "border-border bg-card hover:border-zinc-600"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/drafts/${id}`}
          className="text-sm font-medium text-foreground hover:underline line-clamp-2 flex-1"
        >
          {title}
        </Link>
        <Badge className={`shrink-0 text-xs ${STATUS_COLORS[status]}`}>
          {status}
        </Badge>
      </div>

      <div className="space-y-0.5">
        <p className="text-xs text-muted-foreground">{projectName}</p>
        {siteName && <p className="text-xs text-muted-foreground">{siteName}</p>}
        {targetCategory && (
          <p className="text-xs text-muted-foreground">{targetCategory}</p>
        )}
        <p className="text-xs text-muted-foreground">
          {createdAt.toLocaleDateString()}
        </p>
        {scheduledFor && (
          <p
            className={`text-xs flex items-center gap-1 ${
              isDueSoon ? "text-purple-300 font-medium" : "text-purple-400"
            }`}
          >
            <Calendar className="h-3 w-3" />
            {new Date(scheduledFor).toLocaleString()}
          </p>
        )}
      </div>

      {/* Failure surface — only on the Failed column. The `title` attr
          serves as a tooltip on hover that shows the full reason. */}
      {status === "failed" && (failureReason || publishAttempts) && (
        <div
          className="rounded border border-red-500/40 bg-red-950/40 px-1.5 py-1 text-[10px] text-red-300 leading-snug"
          title={failureReason ?? undefined}
        >
          <div className="flex items-center gap-1">
            <AlertCircle className="h-3 w-3 shrink-0" />
            <span className="line-clamp-2 break-words">
              {failureReason ?? "Publish failed"}
            </span>
          </div>
          {(typeof publishAttempts === "number" || failureCode) && (
            <div className="mt-0.5 flex items-center gap-1.5 text-[9px] text-red-400/80">
              {typeof publishAttempts === "number" && (
                <span>Attempts: {publishAttempts}</span>
              )}
              {failureCode && (
                <span className="font-mono">{failureCode}</span>
              )}
            </div>
          )}
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex flex-wrap gap-1.5">
        {status === "draft" && (
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-xs gap-1"
            disabled={isPending}
            onClick={() => handleAction(() => moveDraftToReview(id))}
          >
            <Eye className="h-3 w-3" />
            Review
          </Button>
        )}
        {status === "review" && (
          <>
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-xs gap-1"
              disabled={isPending}
              onClick={() => handleAction(() => approveDraft(id))}
            >
              <CheckCheck className="h-3 w-3" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-xs gap-1 text-red-400 hover:text-red-300"
              disabled={isPending}
              onClick={() => handleAction(() => rejectDraft(id))}
            >
              <X className="h-3 w-3" />
              Reject
            </Button>
          </>
        )}
        {status === "failed" && (
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-xs gap-1 text-red-300 hover:text-red-200"
            disabled={isPending}
            onClick={handleRetry}
          >
            <RotateCw className="h-3 w-3" />
            Retry publish
          </Button>
        )}
      </div>
    </div>
  );
}
