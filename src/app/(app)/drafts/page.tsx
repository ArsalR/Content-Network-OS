export const dynamic = "force-dynamic";

import { db } from "@/lib/db";
import { drafts, projects, sites } from "@/db/schema";
import { eq } from "drizzle-orm";
import { KanbanBoard } from "@/components/drafts/kanban-board";

type DraftStatus =
  | "generating"
  | "draft"
  | "review"
  | "approved"
  | "scheduled"
  | "publishing"
  | "published"
  | "failed";

export default async function DraftsPage() {
  const allDrafts = await db
    .select({
      id: drafts.id,
      title: drafts.title,
      status: drafts.status,
      targetCategory: drafts.targetCategory,
      createdAt: drafts.createdAt,
      scheduledFor: drafts.scheduledFor,
      projectId: drafts.projectId,
      targetSiteId: drafts.targetSiteId,
    })
    .from(drafts)
    .orderBy(drafts.createdAt);

  const projectIds = [...new Set(allDrafts.map((d) => d.projectId))];
  const siteIds = [...new Set(allDrafts.map((d) => d.targetSiteId).filter(Boolean))] as string[];

  const projectMap = new Map<string, string>();
  const siteMap = new Map<string, string>();

  if (projectIds.length > 0) {
    const projectRows = await db
      .select({ id: projects.id, name: projects.name })
      .from(projects);
    for (const p of projectRows) {
      projectMap.set(p.id, p.name);
    }
  }

  if (siteIds.length > 0) {
    const siteRows = await db
      .select({ id: sites.id, name: sites.name })
      .from(sites);
    for (const s of siteRows) {
      siteMap.set(s.id, s.name);
    }
  }

  const draftsByStatus: Record<string, Array<{
    id: string;
    title: string;
    projectName: string;
    siteName: string | null;
    targetCategory: string | null;
    status: DraftStatus;
    createdAt: Date;
    scheduledFor: Date | null;
  }>> = {};

  for (const draft of allDrafts) {
    const status = draft.status as DraftStatus;
    if (!draftsByStatus[status]) {
      draftsByStatus[status] = [];
    }
    draftsByStatus[status].push({
      id: draft.id,
      title: draft.title,
      projectName: projectMap.get(draft.projectId) ?? "Unknown Project",
      siteName: draft.targetSiteId ? (siteMap.get(draft.targetSiteId) ?? null) : null,
      targetCategory: draft.targetCategory,
      status,
      createdAt: draft.createdAt,
      scheduledFor: draft.scheduledFor,
    });
  }

  const totalDrafts = allDrafts.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Drafts</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {totalDrafts} draft{totalDrafts !== 1 ? "s" : ""} across all projects
          </p>
        </div>
      </div>
      <KanbanBoard draftsByStatus={draftsByStatus} />
    </div>
  );
}
