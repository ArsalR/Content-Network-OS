export const dynamic = "force-dynamic";

import { db } from "@/lib/db";
import { sites, projects, tones, jobs } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { PipelineForm } from "@/components/pipeline/pipeline-form";
import { PipelineJobsTable } from "@/components/pipeline/pipeline-jobs-table";

export default async function PipelinePage() {
  const [allSites, allProjects, allTones, recentJobs] = await Promise.all([
    db.select().from(sites).orderBy(sites.name),
    db.select().from(projects).orderBy(projects.name),
    db.select().from(tones).orderBy(tones.name),
    db
      .select()
      .from(jobs)
      .where(eq(jobs.kind, "generate-draft-with-images"))
      .orderBy(desc(jobs.createdAt))
      .limit(50),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Content Pipeline
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter keywords to generate full articles with AI images, then publish
          to your sites.
        </p>
      </div>
      <PipelineForm
        sites={allSites}
        projects={allProjects}
        tones={allTones}
      />
      <PipelineJobsTable jobs={recentJobs} />
    </div>
  );
}
