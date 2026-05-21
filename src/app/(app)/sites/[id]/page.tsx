export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { sites } from "@/db/schema";
import { eq } from "drizzle-orm";
import { SiteEditForm } from "@/components/sites/site-edit-form";

export default async function SiteEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const site = await db.query.sites.findFirst({ where: eq(sites.id, id) });

  if (!site) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{site.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{site.hostname}</p>
      </div>

      <SiteEditForm
        site={{
          id: site.id,
          name: site.name,
          hostname: site.hostname,
          apiBaseUrl: site.apiBaseUrl,
          kind: site.kind ?? "wordpress",
          defaultCategory: site.defaultCategory,
          defaultTone: site.defaultTone,
          notes: site.notes,
          imageProvider: site.imageProvider,
          imageStyle: site.imageStyle,
          pinterestMode: site.pinterestMode ?? false,
          pinterestCoverPromptExtra: site.pinterestCoverPromptExtra ?? null,
          pinterestSectionPromptExtra: site.pinterestSectionPromptExtra ?? null,
          pinterestContentStyle: site.pinterestContentStyle ?? null,
          pinterestImageSize: site.pinterestImageSize ?? "1000x1500",
        }}
      />
    </div>
  );
}
