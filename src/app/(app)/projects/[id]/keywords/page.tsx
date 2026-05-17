export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { projects, keywords } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { KeywordsTable } from "@/components/keywords/keywords-table";

export default async function ProjectKeywordsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, id),
  });

  if (!project) notFound();

  const rows = await db
    .select()
    .from(keywords)
    .where(eq(keywords.projectId, id))
    .orderBy(desc(keywords.createdAt));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {project.name} — Keywords
        </h1>
      </div>
      <KeywordsTable keywords={rows} projectId={id} />
    </div>
  );
}
