export const dynamic = "force-dynamic";

import { db } from "@/lib/db";
import { promptTemplates } from "@/db/schema";
import { desc } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { PromptActions } from "@/components/settings/prompt-actions";
import { NewPromptButton } from "@/components/settings/new-prompt-button";

const KIND_LABELS: Record<string, string> = {
  draft: "Draft",
  outline: "Outline",
  image_prompt: "Image Prompt",
  social_caption: "Social Caption",
};

export default async function PromptsPage() {
  const rows = await db
    .select()
    .from(promptTemplates)
    .orderBy(desc(promptTemplates.createdAt));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Prompt Templates
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Templates used when generating content with AI.
          </p>
        </div>
        <NewPromptButton />
      </div>

      <Separator />

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <p className="text-sm text-muted-foreground">
            No prompt templates yet. Click &ldquo;New Template&rdquo; to create
            one.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <div
              key={row.id}
              className="flex items-start justify-between rounded-lg border border-border bg-card p-4"
            >
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-foreground">{row.name}</p>
                  <Badge variant="outline" className="text-xs">
                    {KIND_LABELS[row.kind] ?? row.kind}
                  </Badge>
                  {row.isDefault && (
                    <Badge className="border-transparent bg-blue-800 text-blue-200 text-xs">
                      Default
                    </Badge>
                  )}
                </div>
                <p className="max-w-xl font-mono text-xs text-muted-foreground line-clamp-2">
                  {row.template}
                </p>
              </div>
              <PromptActions template={row} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
