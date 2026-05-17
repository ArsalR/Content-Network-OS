export const dynamic = "force-dynamic";

import { db } from "@/lib/db";
import { sites } from "@/db/schema";
import { ProjectForm } from "@/components/projects/project-form";

export default async function NewProjectPage() {
  const allSites = await db
    .select({ id: sites.id, name: sites.name })
    .from(sites)
    .orderBy(sites.name);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">New project</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create a new content production project
        </p>
      </div>
      <ProjectForm sites={allSites} />
    </div>
  );
}
