export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { projects, sites, keywords, briefs, drafts } from "@/db/schema";
import { eq, count } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProjectActions } from "@/components/projects/project-actions";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [project] = await db
    .select({
      id: projects.id,
      name: projects.name,
      description: projects.description,
      status: projects.status,
      defaultSiteId: projects.defaultSiteId,
      siteName: sites.name,
    })
    .from(projects)
    .leftJoin(sites, eq(projects.defaultSiteId, sites.id))
    .where(eq(projects.id, id))
    .limit(1);

  if (!project) notFound();

  const [keywordCount] = await db
    .select({ count: count() })
    .from(keywords)
    .where(eq(keywords.projectId, id));

  const [briefCount] = await db
    .select({ count: count() })
    .from(briefs)
    .where(eq(briefs.projectId, id));

  const [draftCount] = await db
    .select({ count: count() })
    .from(drafts)
    .where(eq(drafts.projectId, id));

  const [publishedCount] = await db
    .select({ count: count() })
    .from(drafts)
    .where(eq(drafts.projectId, id));

  const stats = [
    { label: "Keywords", value: keywordCount?.count ?? 0 },
    { label: "Briefs", value: briefCount?.count ?? 0 },
    { label: "Drafts", value: draftCount?.count ?? 0 },
    { label: "Published", value: publishedCount?.count ?? 0 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {project.name}
            </h1>
            <ProjectStatusBadge status={project.status} />
          </div>
          {project.description && (
            <p className="mt-1 text-sm text-muted-foreground">{project.description}</p>
          )}
          {project.siteName && (
            <p className="mt-1 text-xs text-muted-foreground">
              Default site: {project.siteName}
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/projects/${id}/edit`}>Edit</Link>
          </Button>
          <ProjectActions
            projectId={id}
            status={project.status}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ label, value }) => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex gap-1 border-b border-border">
        {[
          { label: "Keywords", href: `/projects/${id}/keywords` },
          { label: "Briefs", href: `/projects/${id}/briefs` },
          { label: "Drafts", href: `/projects/${id}/drafts` },
        ].map(({ label, href }) => (
          <Link
            key={href}
            href={href}
            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors border-b-2 border-transparent hover:border-border"
          >
            {label}
          </Link>
        ))}
      </div>
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
