export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { drafts, projects, sites } from "@/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { DraftEditor } from "@/components/drafts/draft-editor";

export default async function DraftEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const draft = await db.query.drafts.findFirst({
    where: eq(drafts.id, id),
  });

  if (!draft) notFound();

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, draft.projectId),
  });

  const allSites = await db
    .select({ id: sites.id, name: sites.name })
    .from(sites)
    .orderBy(sites.name);

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="flex items-center gap-3 shrink-0">
        <Link
          href="/drafts"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Drafts
        </Link>
        {project && (
          <>
            <span className="text-muted-foreground">/</span>
            <Link
              href={`/projects/${project.id}/drafts`}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {project.name}
            </Link>
          </>
        )}
        <span className="text-muted-foreground">/</span>
        <h1 className="text-sm font-medium text-foreground truncate max-w-md">
          {draft.title}
        </h1>
      </div>

      {/* Editor */}
      <DraftEditor
        draftId={draft.id}
        initialTitle={draft.title}
        initialSlug={draft.slug}
        initialExcerpt={draft.excerpt}
        initialContentHtml={draft.contentHtml}
        initialSeoTitle={draft.seoTitle}
        initialSeoDescription={draft.seoDescription}
        initialSeoKeywords={draft.seoKeywords}
        initialCoverImageUrl={draft.coverImageUrl}
        initialCoverImageAlt={draft.coverImageAlt}
        initialTargetSiteId={draft.targetSiteId}
        initialTargetCategory={draft.targetCategory}
        status={draft.status}
        sites={allSites}
      />
    </div>
  );
}
