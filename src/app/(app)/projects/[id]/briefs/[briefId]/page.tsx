export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { db } from "@/lib/db";
import { briefs, tones } from "@/db/schema";
import { eq } from "drizzle-orm";
import { BriefEditor } from "@/components/briefs/brief-editor";
import { Badge } from "@/components/ui/badge";

type OutlineItem = { h2: string; points: string[] };
type BriefStatus = "draft" | "ready" | "generating" | "generated" | "published";

const STATUS_COLORS: Record<BriefStatus, string> = {
  draft: "border-transparent bg-zinc-700 text-zinc-200",
  ready: "border-transparent bg-blue-800 text-blue-200",
  generating: "border-transparent bg-yellow-800 text-yellow-200",
  generated: "border-transparent bg-green-800 text-green-200",
  published: "border-transparent bg-teal-800 text-teal-200",
};

export default async function BriefDetailPage({
  params,
}: {
  params: Promise<{ id: string; briefId: string }>;
}) {
  const { id, briefId } = await params;

  const brief = await db.query.briefs.findFirst({
    where: eq(briefs.id, briefId),
  });

  if (!brief || brief.projectId !== id) notFound();

  const toneRows = await db
    .select({ id: tones.id, name: tones.name })
    .from(tones);

  const briefData = {
    id: brief.id,
    projectId: brief.projectId,
    title: brief.title,
    targetKeyword: brief.targetKeyword,
    wordCount: brief.wordCount,
    toneId: brief.toneId,
    customInstructions: brief.customInstructions,
    outline: (brief.outline as OutlineItem[]) ?? [],
    faqQuestions: (brief.faqQuestions as string[] | null) ?? null,
  };

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/projects/${id}/briefs`}
          className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Back to Briefs
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {brief.title}
          </h1>
          <Badge className={STATUS_COLORS[brief.status]}>
            {brief.status}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Target keyword: <span className="font-medium">{brief.targetKeyword}</span>
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-6">
        <BriefEditor brief={briefData} tones={toneRows} />
      </div>
    </div>
  );
}
