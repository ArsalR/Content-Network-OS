"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCheck, Eye, X, Calendar } from "lucide-react";
import { moveDraftToReview, approveDraft, rejectDraft } from "@/actions/drafts";

type DraftStatus =
  | "generating"
  | "draft"
  | "review"
  | "approved"
  | "scheduled"
  | "publishing"
  | "published"
  | "failed";

interface DraftCardProps {
  id: string;
  title: string;
  projectName: string;
  siteName: string | null;
  targetCategory: string | null;
  status: DraftStatus;
  createdAt: Date;
  scheduledFor: Date | null;
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
}: DraftCardProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleAction(fn: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        setError(result.error);
      }
    });
  }

  return (
    <div className="rounded-md border border-border bg-card p-3 space-y-2 hover:border-zinc-600 transition-colors">
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
        {siteName && (
          <p className="text-xs text-muted-foreground">{siteName}</p>
        )}
        {targetCategory && (
          <p className="text-xs text-muted-foreground">{targetCategory}</p>
        )}
        <p className="text-xs text-muted-foreground">
          {createdAt.toLocaleDateString()}
        </p>
        {scheduledFor && (
          <p className="text-xs text-purple-400 flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {scheduledFor.toLocaleDateString()}
          </p>
        )}
      </div>

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
      </div>
    </div>
  );
}
