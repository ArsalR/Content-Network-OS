export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { projects, sites } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ProjectEditForm } from "@/components/projects/project-edit-form";

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, id),
  });

  if (!project) notFound();

  const allSites = await db
    .select({ id: sites.id, name: sites.name })
    .from(sites)
    .orderBy(sites.name);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Edit project
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{project.name}</p>
      </div>
      <ProjectEditForm project={project} sites={allSites} />
    </div>
  );
}
