export const dynamic = "force-dynamic";

import { db } from "@/lib/db";
import { drafts, projects, sites } from "@/db/schema";
import { eq, isNotNull, and, inArray } from "drizzle-orm";
import { CalendarView } from "@/components/calendar/calendar-view";

type CalendarSearchParams = {
  view?: "month" | "week";
  date?: string;
  project?: string;
  site?: string;
  status?: string;
};

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<CalendarSearchParams>;
}) {
  const params = await searchParams;
  const view = params.view === "week" ? "week" : "month";
  const anchorIso = params.date && /^\d{4}-\d{2}-\d{2}/.test(params.date) ? params.date : null;

  // Build the where-clause incrementally so filters compose. We only care
  // about drafts that have a scheduledFor (the calendar's domain).
  const filters = [isNotNull(drafts.scheduledFor)];
  if (params.project) filters.push(eq(drafts.projectId, params.project));
  if (params.site) filters.push(eq(drafts.targetSiteId, params.site));
  if (params.status) {
    // Comma-separated multi-value filter
    const statuses = params.status.split(",").filter(Boolean);
    if (statuses.length > 0) {
      filters.push(
        inArray(
          drafts.status,
          statuses as Array<
            | "generating"
            | "draft"
            | "review"
            | "approved"
            | "scheduled"
            | "publishing"
            | "published"
            | "failed"
          >
        )
      );
    }
  }

  const [scheduledDrafts, allProjects, allSites] = await Promise.all([
    db
      .select({
        id: drafts.id,
        title: drafts.title,
        status: drafts.status,
        projectId: drafts.projectId,
        targetSiteId: drafts.targetSiteId,
        scheduledFor: drafts.scheduledFor,
        scheduledTimezone: drafts.scheduledTimezone,
      })
      .from(drafts)
      .where(and(...filters))
      .orderBy(drafts.scheduledFor),
    db.select({ id: projects.id, name: projects.name }).from(projects),
    db.select({ id: sites.id, name: sites.name }).from(sites),
  ]);

  // Resolve names client-side to avoid extra joins on top of the filter.
  const projectMap = new Map(allProjects.map((p) => [p.id, p.name]));
  const siteMap = new Map(allSites.map((s) => [s.id, s.name]));

  const items = scheduledDrafts
    .filter((d) => d.scheduledFor !== null)
    .map((d) => ({
      id: d.id,
      title: d.title,
      status: d.status,
      // Serialize to ISO so the client component receives a plain string
      // that's stable across timezone boundaries; the client renders
      // in the browser's local TZ.
      scheduledForIso: d.scheduledFor!.toISOString(),
      scheduledTimezone: d.scheduledTimezone,
      projectId: d.projectId,
      projectName: projectMap.get(d.projectId) ?? "Unknown Project",
      siteId: d.targetSiteId,
      siteName: d.targetSiteId ? siteMap.get(d.targetSiteId) ?? null : null,
    }));

  return (
    <div className="space-y-4 h-full flex flex-col">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Calendar</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Scheduled drafts across all sites. Drag a draft to a different day to
          reschedule.
        </p>
      </div>

      <CalendarView
        items={items}
        view={view}
        anchorDateIso={anchorIso}
        projects={allProjects}
        sites={allSites}
        activeFilters={{
          project: params.project ?? null,
          site: params.site ?? null,
          status: params.status ?? null,
        }}
      />
    </div>
  );
}
