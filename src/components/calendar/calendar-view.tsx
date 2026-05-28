"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import { rescheduleDraft } from "@/actions/drafts";
import { toast } from "sonner";

type DraftStatus =
  | "generating"
  | "draft"
  | "review"
  | "approved"
  | "scheduled"
  | "publishing"
  | "published"
  | "failed";

export interface CalendarItem {
  id: string;
  title: string;
  status: DraftStatus;
  scheduledForIso: string;
  scheduledTimezone: string | null;
  projectId: string;
  projectName: string;
  siteId: string | null;
  siteName: string | null;
}

interface CalendarViewProps {
  items: CalendarItem[];
  view: "month" | "week";
  anchorDateIso: string | null;
  projects: Array<{ id: string; name: string }>;
  sites: Array<{ id: string; name: string }>;
  activeFilters: {
    project: string | null;
    site: string | null;
    status: string | null;
  };
}

const STATUS_DOT: Record<DraftStatus, string> = {
  generating: "bg-yellow-500",
  draft: "bg-zinc-500",
  review: "bg-blue-500",
  approved: "bg-green-500",
  scheduled: "bg-purple-500",
  publishing: "bg-orange-500",
  published: "bg-teal-500",
  failed: "bg-red-500",
};

/**
 * Hash a string to a stable hue so each site gets a consistent chip color.
 * Pure presentation — no semantics attached.
 */
function hueFor(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 360;
}

export function CalendarView({
  items,
  view,
  anchorDateIso,
  projects,
  sites,
  activeFilters,
}: CalendarViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // The anchor date controls which month/week we're viewing. Server-rendered
  // anchor wins so URL ↔ view stay consistent across refreshes.
  const anchor = useMemo(() => {
    if (anchorDateIso) {
      const d = new Date(anchorDateIso);
      if (!Number.isNaN(d.getTime())) return d;
    }
    return startOfDay(new Date());
  }, [anchorDateIso]);

  // Compute the date range to render. Month view shows the calendar grid
  // (leading + trailing days); week view shows Mon–Sun (or Sun–Sat depending
  // on locale — date-fns defaults to Sunday start).
  const { gridStart, gridEnd } = useMemo(() => {
    if (view === "week") {
      return {
        gridStart: startOfWeek(anchor),
        gridEnd: endOfWeek(anchor),
      };
    }
    return {
      gridStart: startOfWeek(startOfMonth(anchor)),
      gridEnd: endOfWeek(endOfMonth(anchor)),
    };
  }, [anchor, view]);

  // Bucket items by ISO date (YYYY-MM-DD in local TZ for grouping).
  const itemsByDateKey = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const it of items) {
      const dt = new Date(it.scheduledForIso);
      const key = format(dt, "yyyy-MM-dd");
      const arr = map.get(key);
      if (arr) arr.push(it);
      else map.set(key, [it]);
    }
    // Sort each day's items by time
    for (const arr of map.values()) {
      arr.sort(
        (a, b) =>
          new Date(a.scheduledForIso).getTime() - new Date(b.scheduledForIso).getTime()
      );
    }
    return map;
  }, [items]);

  // Build the day cells.
  const days = useMemo(() => {
    const out: Date[] = [];
    let d = gridStart;
    while (d <= gridEnd) {
      out.push(d);
      d = addDays(d, 1);
    }
    return out;
  }, [gridStart, gridEnd]);

  function navigate(deltaUnits: number) {
    const next = view === "week" ? addDays(anchor, deltaUnits * 7) : addMonths(anchor, deltaUnits);
    updateUrl({ date: format(next, "yyyy-MM-dd") });
  }

  function setView(next: "month" | "week") {
    updateUrl({ view: next });
  }

  function updateUrl(patch: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    router.replace(`/calendar?${next.toString()}`);
  }

  function handleFilterChange(key: "project" | "site" | "status", value: string | null) {
    updateUrl({ [key]: value });
  }

  // Drag state — minimal, no library. We carry the draft id on the
  // DataTransfer payload so the drop handler knows what to reschedule.
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  function onDropOnDay(day: Date, e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOverKey(null);
    const draftId = e.dataTransfer.getData("text/draft-id");
    if (!draftId) return;
    const draft = items.find((i) => i.id === draftId);
    if (!draft) return;

    // Preserve the original time-of-day; only the date changes.
    const original = new Date(draft.scheduledForIso);
    const next = new Date(day);
    next.setHours(
      original.getHours(),
      original.getMinutes(),
      original.getSeconds(),
      original.getMilliseconds()
    );

    // No-op only when the user dropped on the same calendar cell as the
    // draft currently occupies. Comparing `next` against `original` is
    // wrong for cross-midnight UTC drafts: setHours can push `next` into
    // a different local-day than the drop target, masking real moves.
    // Compare the drop target (`day`) against the draft's bucket key
    // directly — that's exactly the cell the chip rendered in.
    const draftBucketKey = format(original, "yyyy-MM-dd");
    const dropBucketKey = format(day, "yyyy-MM-dd");
    if (draftBucketKey === dropBucketKey) return;

    startTransition(async () => {
      const tz =
        Intl.DateTimeFormat().resolvedOptions().timeZone ||
        draft.scheduledTimezone ||
        "UTC";
      const res = await rescheduleDraft(draftId, next.toISOString(), tz);
      if (!res.ok) toast.error(res.error);
      else toast.success(`Rescheduled to ${format(next, "MMM d, p")}`);
    });
  }

  const headerLabel =
    view === "week"
      ? `${format(gridStart, "MMM d")} – ${format(gridEnd, "MMM d, yyyy")}`
      : format(anchor, "MMMM yyyy");

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => navigate(-1)}
            aria-label="Previous"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => updateUrl({ date: format(new Date(), "yyyy-MM-dd") })}
          >
            Today
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => navigate(1)}
            aria-label="Next"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <div className="ml-2 flex items-center gap-1 text-sm font-medium">
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
            {headerLabel}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant={view === "month" ? "default" : "outline"}
            size="sm"
            onClick={() => setView("month")}
          >
            Month
          </Button>
          <Button
            type="button"
            variant={view === "week" ? "default" : "outline"}
            size="sm"
            onClick={() => setView("week")}
          >
            Week
          </Button>
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <FilterDropdown
          label="Project"
          value={activeFilters.project}
          options={projects.map((p) => ({ value: p.id, label: p.name }))}
          onChange={(v) => handleFilterChange("project", v)}
        />
        <FilterDropdown
          label="Site"
          value={activeFilters.site}
          options={sites.map((s) => ({ value: s.id, label: s.name }))}
          onChange={(v) => handleFilterChange("site", v)}
        />
        <FilterDropdown
          label="Status"
          value={activeFilters.status}
          options={[
            { value: "scheduled", label: "Scheduled" },
            { value: "publishing", label: "Publishing" },
            { value: "published", label: "Published" },
            { value: "failed", label: "Failed" },
          ]}
          onChange={(v) => handleFilterChange("status", v)}
        />
        {(activeFilters.project || activeFilters.site || activeFilters.status) && (
          <button
            type="button"
            onClick={() =>
              updateUrl({ project: null, site: null, status: null })
            }
            className="text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            Clear filters
          </button>
        )}
        {isPending && (
          <span className="ml-auto text-muted-foreground">Updating…</span>
        )}
      </div>

      {/* Weekday header (Sun–Sat in date-fns default locale) */}
      <div className="grid grid-cols-7 gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="px-1.5 py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div
        className={`grid grid-cols-7 gap-1 flex-1 min-h-0 ${
          view === "week" ? "auto-rows-fr" : "auto-rows-[minmax(96px,1fr)]"
        }`}
      >
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const dayItems = itemsByDateKey.get(key) ?? [];
          const isToday = isSameDay(day, new Date());
          const inCurrentMonth = view === "week" || isSameMonth(day, anchor);
          const isDragOver = dragOverKey === key;
          return (
            <div
              key={key}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragOverKey !== key) setDragOverKey(key);
              }}
              onDragLeave={() => setDragOverKey((current) => (current === key ? null : current))}
              onDrop={(e) => onDropOnDay(day, e)}
              className={`rounded border p-1 flex flex-col gap-1 overflow-hidden ${
                isDragOver
                  ? "border-primary bg-primary/10"
                  : isToday
                    ? "border-primary/50 bg-card"
                    : inCurrentMonth
                      ? "border-border bg-card"
                      : "border-border/50 bg-card/50 text-muted-foreground"
              }`}
            >
              <div
                className={`text-[11px] font-medium ${
                  isToday ? "text-primary" : ""
                }`}
              >
                {format(day, "d")}
              </div>
              <div className="flex flex-col gap-1 overflow-y-auto min-h-0">
                {dayItems.map((it) => (
                  <CalendarChip key={it.id} item={it} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CalendarChip({ item }: { item: CalendarItem }) {
  const hue = item.siteId ? hueFor(item.siteId) : 200;
  const time = format(new Date(item.scheduledForIso), "p");

  return (
    <Link
      href={`/drafts/${item.id}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/draft-id", item.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      className="group block rounded px-1.5 py-1 text-[10px] leading-tight border cursor-grab active:cursor-grabbing"
      style={{
        backgroundColor: `hsl(${hue} 50% 18% / 1)`,
        borderColor: `hsl(${hue} 60% 35% / 1)`,
        color: `hsl(${hue} 70% 85% / 1)`,
      }}
      title={`${item.title} — ${item.siteName ?? "no site"} — ${time}`}
    >
      <div className="flex items-center gap-1">
        <span
          className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[item.status]}`}
          aria-hidden
        />
        <span className="font-medium tabular-nums opacity-80">{time}</span>
      </div>
      <div className="line-clamp-2">{item.title}</div>
    </Link>
  );
}

/**
 * Minimal native select wrapped to look like a pill. Uses native <select>
 * for accessibility — Radix Select would be heavier than needed here.
 */
function FilterDropdown({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | null;
  options: Array<{ value: string; label: string }>;
  onChange: (next: string | null) => void;
}) {
  const isActive = Boolean(value);
  return (
    <label
      className={`relative inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 cursor-pointer ${
        isActive
          ? "border-primary/60 bg-primary/10 text-foreground"
          : "border-border bg-card text-muted-foreground hover:text-foreground"
      }`}
    >
      <span className="font-medium">{label}:</span>
      <span>
        {value
          ? options.find((o) => o.value === value)?.label ?? value
          : "All"}
      </span>
      <select
        className="absolute inset-0 w-full opacity-0 cursor-pointer"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
