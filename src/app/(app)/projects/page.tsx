export const dynamic = "force-dynamic";

import Link from "next/link";
import { db } from "@/lib/db";
import { projects, sites, keywords, drafts } from "@/db/schema";
import { eq, count } from "drizzle-orm";
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
import { Plus } from "lucide-react";
import { format } from "date-fns";

export default async function ProjectsPage() {
  const allProjects = await db
    .select({
      id: projects.id,
      name: projects.name,
      status: projects.status,
      createdAt: projects.createdAt,
      defaultSiteId: projects.defaultSiteId,
      siteName: sites.name,
    })
    .from(projects)
    .leftJoin(sites, eq(projects.defaultSiteId, sites.id))
    .orderBy(projects.createdAt);

  const keywordCounts = await db
    .select({ projectId: keywords.projectId, count: count() })
    .from(keywords)
    .groupBy(keywords.projectId);

  const draftCounts = await db
    .select({ projectId: drafts.projectId, count: count() })
    .from(drafts)
    .groupBy(drafts.projectId);

  const keywordMap = new Map(keywordCounts.map((r) => [r.projectId, r.count]));
  const draftMap = new Map(draftCounts.map((r) => [r.projectId, r.count]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your content production projects
          </p>
        </div>
        <Button asChild>
          <Link href="/projects/new">
            <Plus className="mr-2 h-4 w-4" />
            New project
          </Link>
        </Button>
      </div>

      {allProjects.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No projects yet. Create your first project to get started.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Default Site</TableHead>
                <TableHead>Keywords</TableHead>
                <TableHead>Drafts</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allProjects.map((project) => (
                <TableRow key={project.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/projects/${project.id}`}
                      className="hover:underline text-foreground"
                    >
                      {project.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <ProjectStatusBadge status={project.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {project.siteName ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {keywordMap.get(project.id) ?? 0}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {draftMap.get(project.id) ?? 0}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {format(project.createdAt, "MMM d, yyyy")}
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

function ProjectStatusBadge({ status }: { status: "active" | "archived" }) {
  if (status === "active") {
    return (
      <Badge className="border-transparent bg-green-500/20 text-green-400 hover:bg-green-500/20">
        Active
      </Badge>
    );
  }
  return (
    <Badge className="border-transparent bg-muted/50 text-muted-foreground hover:bg-muted/50">
      Archived
    </Badge>
  );
}
