"use client";

import { useMemo } from "react";
import { DraftCard, type DraftCardProps } from "./draft-card";

type DraftStatus =
  | "generating"
  | "draft"
  | "review"
  | "approved"
  | "scheduled"
  | "publishing"
  | "published"
  | "failed";

export type KanbanDraftItem = Omit<DraftCardProps, "isDueSoon">;

interface KanbanBoardProps {
  draftsByStatus: Record<string, KanbanDraftItem[]>;
}

const COLUMNS: { key: DraftStatus; label: string }[] = [
  { key: "generating", label: "Generating" },
  { key: "draft", label: "Draft" },
  { key: "review", label: "Review" },
  { key: "approved", label: "Approved" },
  { key: "scheduled", label: "Scheduled" },
  { key: "published", label: "Published" },
  { key: "failed", label: "Failed" },
];

/** "Due soon" = scheduled and `scheduledFor` is within the next 60 minutes. */
const DUE_SOON_WINDOW_MS = 60 * 60 * 1000;

function isDueSoon(scheduledFor: Date | null): boolean {
  if (!scheduledFor) return false;
  const t = new Date(scheduledFor).getTime();
  const now = Date.now();
  return t >= now && t - now <= DUE_SOON_WINDOW_MS;
}

export function KanbanBoard({ draftsByStatus }: KanbanBoardProps) {
  // Memoize the per-column drafts including the due-soon flag so a single
  // pass classifies + sorts each column.
  const columns = useMemo(
    () =>
      COLUMNS.map(({ key, label }) => {
        const items = (draftsByStatus[key] ?? []).map((d) => ({
          ...d,
          isDueSoon: key === "scheduled" && isDueSoon(d.scheduledFor),
        }));
        // For Scheduled, push due-soon drafts to the top.
        if (key === "scheduled") {
          items.sort((a, b) => {
            if (a.isDueSoon && !b.isDueSoon) return -1;
            if (!a.isDueSoon && b.isDueSoon) return 1;
            // both due soon or both not — order by scheduledFor ascending
            const av = a.scheduledFor ? new Date(a.scheduledFor).getTime() : Number.MAX_SAFE_INTEGER;
            const bv = b.scheduledFor ? new Date(b.scheduledFor).getTime() : Number.MAX_SAFE_INTEGER;
            return av - bv;
          });
        }
        const dueSoonCount =
          key === "scheduled" ? items.filter((d) => d.isDueSoon).length : 0;
        return { key, label, items, dueSoonCount };
      }),
    [draftsByStatus]
  );

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {columns.map(({ key, label, items, dueSoonCount }) => (
        <div
          key={key}
          className="flex flex-col min-w-[260px] max-w-[300px] flex-shrink-0"
        >
          <div className="flex items-center justify-between mb-3 px-1">
            <h3 className="text-sm font-semibold text-foreground">{label}</h3>
            <span className="text-xs text-muted-foreground bg-secondary rounded-full px-2 py-0.5">
              {items.length}
            </span>
          </div>

          {/* Due-soon banner on the Scheduled column when any drafts are
              ≤60 minutes from publishing. Gives a quick "what's about to
              run" surface without a separate column. */}
          {key === "scheduled" && dueSoonCount > 0 && (
            <div className="mb-2 rounded-md border border-purple-500/30 bg-purple-500/10 px-2 py-1.5 text-[11px] text-purple-300">
              {dueSoonCount} due in the next hour
            </div>
          )}

          <div className="flex flex-col gap-2 overflow-y-auto max-h-[calc(100vh-220px)] pr-1">
            {items.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-4 text-center">
                <p className="text-xs text-muted-foreground">No drafts</p>
              </div>
            ) : (
              items.map((draft) => <DraftCard key={draft.id} {...draft} />)
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
