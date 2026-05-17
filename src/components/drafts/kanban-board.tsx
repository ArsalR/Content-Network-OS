"use client";

import { DraftCard } from "./draft-card";

type DraftStatus =
  | "generating"
  | "draft"
  | "review"
  | "approved"
  | "scheduled"
  | "publishing"
  | "published"
  | "failed";

interface DraftItem {
  id: string;
  title: string;
  projectName: string;
  siteName: string | null;
  targetCategory: string | null;
  status: DraftStatus;
  createdAt: Date;
  scheduledFor: Date | null;
}

interface KanbanBoardProps {
  draftsByStatus: Record<string, DraftItem[]>;
}

const COLUMNS: { key: DraftStatus; label: string }[] = [
  { key: "draft", label: "Draft" },
  { key: "review", label: "Review" },
  { key: "approved", label: "Approved" },
  { key: "scheduled", label: "Scheduled" },
  { key: "published", label: "Published" },
];

export function KanbanBoard({ draftsByStatus }: KanbanBoardProps) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {COLUMNS.map(({ key, label }) => {
        const columnDrafts = draftsByStatus[key] ?? [];
        return (
          <div key={key} className="flex flex-col min-w-[260px] max-w-[300px] flex-shrink-0">
            <div className="flex items-center justify-between mb-3 px-1">
              <h3 className="text-sm font-semibold text-foreground">{label}</h3>
              <span className="text-xs text-muted-foreground bg-secondary rounded-full px-2 py-0.5">
                {columnDrafts.length}
              </span>
            </div>
            <div className="flex flex-col gap-2 overflow-y-auto max-h-[calc(100vh-220px)] pr-1">
              {columnDrafts.length === 0 ? (
                <div className="rounded-md border border-dashed border-border p-4 text-center">
                  <p className="text-xs text-muted-foreground">No drafts</p>
                </div>
              ) : (
                columnDrafts.map((draft) => (
                  <DraftCard key={draft.id} {...draft} />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
