export const dynamic = "force-dynamic";

import { db } from "@/lib/db";
import { tones } from "@/db/schema";
import { desc } from "drizzle-orm";
import { ToneActions } from "@/components/settings/tone-actions";
import { NewToneButton } from "@/components/settings/new-tone-button";
import { Separator } from "@/components/ui/separator";

export default async function TonesPage() {
  const rows = await db.select().from(tones).orderBy(desc(tones.createdAt));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Tones
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Writing tones used when generating content.
          </p>
        </div>
        <NewToneButton />
      </div>

      <Separator />

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <p className="text-sm text-muted-foreground">
            No tones yet. Click &ldquo;New Tone&rdquo; to create one.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((tone) => (
            <div
              key={tone.id}
              className="flex items-start justify-between rounded-lg border border-border bg-card p-4"
            >
              <div className="space-y-1">
                <p className="font-medium text-foreground">{tone.name}</p>
                {tone.description && (
                  <p className="text-sm text-muted-foreground">
                    {tone.description}
                  </p>
                )}
                <p className="max-w-xl text-sm text-muted-foreground line-clamp-2">
                  {tone.prompt}
                </p>
              </div>
              <ToneActions tone={tone} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
