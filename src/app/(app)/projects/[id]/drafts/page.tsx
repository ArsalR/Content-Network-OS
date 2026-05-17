export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { projects, drafts, sites } from "@/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PenLine } from "lucide-react";

type DraftStatus =
  | "generating"
  | "draft"
  | "review"
  | "approved"
  | "scheduled"
  | "publishing"
  | "published"
  | "failed";

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

export default async function ProjectDraftsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, id),
  });

  if (!project) notFound();

  const projectDrafts = await db
    .select({
      id: drafts.id,
      title: drafts.title,
      slug: drafts.slug,
      status: drafts.status,
      targetSiteId: drafts.targetSiteId,
      targetCategory: drafts.targetCategory,
      scheduledFor: drafts.scheduledFor,
      createdAt: drafts.createdAt,
    })
    .from(drafts)
    .where(eq(drafts.projectId, id))
    .orderBy(drafts.createdAt);

  const siteIds = [...new Set(projectDrafts.map((d) => d.targetSiteId).filter(Boolean))] as string[];
  const siteMap = new Map<string, string>();

  if (siteIds.length > 0) {
    const siteRows = await db
      .select({ id: sites.id, name: sites.name })
      .from(sites);
    for (const s of siteRows) {
      siteMap.set(s.id, s.name);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {project.name} — Drafts
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {projectDrafts.length} draft{projectDrafts.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {projectDrafts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <p className="text-sm text-muted-foreground">
            No drafts yet. Generate one from a brief.
          </p>
          <Link href={`/projects/${id}/briefs`}>
            <Button variant="outline" size="sm" className="mt-4">
              Go to Briefs
            </Button>
          </Link>
        </div>
      ) : (
        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead className="w-28">Status</TableHead>
                <TableHead className="w-40">Target Site</TableHead>
                <TableHead className="w-36">Scheduled</TableHead>
                <TableHead className="w-36">Created</TableHead>
                <TableHead className="w-20">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projectDrafts.map((draft) => (
                <TableRow key={draft.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/drafts/${draft.id}`}
                      className="hover:underline"
                    >
                      {draft.title}
                    </Link>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">
                      {draft.slug}
                    </p>
                  </TableCell>
                  <TableCell>
                    <Badge className={STATUS_COLORS[draft.status as DraftStatus]}>
                      {draft.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {draft.targetSiteId
                      ? (siteMap.get(draft.targetSiteId) ?? "—")
                      : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {draft.scheduledFor
                      ? draft.scheduledFor.toLocaleDateString()
                      : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {draft.createdAt.toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Link href={`/drafts/${draft.id}`}>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      >
                        <PenLine className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
