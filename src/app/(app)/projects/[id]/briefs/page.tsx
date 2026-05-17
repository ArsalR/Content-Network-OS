export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { briefs, projects, tones } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { BriefList } from "@/components/briefs/brief-list";

type OutlineItem = { h2: string; points: string[] };

export default async function ProjectBriefsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, id),
  });

  if (!project) notFound();

  const briefRows = await db.query.briefs.findMany({
    where: eq(briefs.projectId, id),
    orderBy: (b, { desc }) => [desc(b.createdAt)],
  });

  const toneRows = await db.select({ id: tones.id, name: tones.name }).from(tones);

  const toneMap = new Map(toneRows.map((t) => [t.id, t.name]));

  const briefList = briefRows.map((b) => ({
    id: b.id,
    title: b.title,
    targetKeyword: b.targetKeyword,
    wordCount: b.wordCount,
    toneName: b.toneId ? (toneMap.get(b.toneId) ?? null) : null,
    status: b.status,
    keywordId: b.keywordId,
    outline: (b.outline as OutlineItem[]) ?? [],
    createdAt: b.createdAt,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {project.name} — Briefs
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {briefList.length} brief{briefList.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/projects/${id}/keywords`}>
            <Button variant="outline" size="sm">
              Generate from Keyword
            </Button>
          </Link>
          <Link href={`/projects/${id}/briefs/new`}>
            <Button size="sm">
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New Brief
            </Button>
          </Link>
        </div>
      </div>

      <BriefList briefs={briefList} projectId={id} />
    </div>
  );
}
