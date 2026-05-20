export const dynamic = "force-dynamic";

import Link from "next/link";
import { db } from "@/lib/db";
import { sites } from "@/db/schema";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CheckCircle2, XCircle } from "lucide-react";

export default async function PinterestSettingsPage() {
  const allSites = await db.select().from(sites).orderBy(sites.name);

  const enabledCount = allSites.filter((s) => s.pinterestMode).length;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Pinterest Mode
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Optimize article generation for the Pinterest feed
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <h2 className="mb-2 text-sm font-semibold text-foreground">
          What Pinterest Mode does
        </h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>
            Generates a <strong className="text-foreground">vertical pin/cover image</strong>{" "}
            (1024×1792 DALL-E / 2:3 Gemini) with a 2-3 photo collage and the article title
            overlaid, designed to perform in Pinterest&apos;s feed.
          </li>
          <li>
            Generates <strong className="text-foreground">unique vertical section images</strong>{" "}
            (2:3 aspect ratio) — each prompt is engineered with specific colors, materials, and
            style details so similar articles don&apos;t produce similar-looking images.
          </li>
          <li>
            Writes article copy in an <strong className="text-foreground">aspirational, second-person voice</strong>{" "}
            with Pinterest power words (stunning, effortless, gorgeous, transform, cozy…).
          </li>
          <li>
            Each numbered item has a catchy subheading + 100-150 words of actionable content,
            visually distinct from every other item.
          </li>
        </ul>
      </div>

      <div className="rounded-lg border border-pink-500/40 bg-pink-500/5 p-5">
        <h2 className="mb-2 text-sm font-semibold text-foreground">
          Pinterest Image Guidelines
        </h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>
            <strong className="text-foreground">Optimal size:</strong> 1000×1500 px (2:3 vertical
            ratio). Square (1:1) and horizontal images get less distribution.
          </li>
          <li>
            <strong className="text-foreground">Cover/Pin image:</strong> 2-3 photo collage of the
            subject matter with the article title overlaid in bold readable text.
          </li>
          <li>
            <strong className="text-foreground">Section images:</strong> directly related to that
            section&apos;s heading + content, lifestyle/aspirational style, bright clean
            backgrounds.
          </li>
          <li>
            <strong className="text-foreground">Uniqueness:</strong> every prompt includes specific
            colors, materials, and style keywords so no two images look alike — even across
            articles on similar topics.
          </li>
        </ul>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border p-5">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Per-site Pinterest configuration
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {enabledCount} of {allSites.length} site{allSites.length === 1 ? "" : "s"} have
              Pinterest mode enabled
            </p>
          </div>
        </div>

        {allSites.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No sites yet.{" "}
            <Link href="/sites/new" className="text-primary underline">
              Add your first site
            </Link>{" "}
            and toggle Pinterest Mode in the site settings.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Site</TableHead>
                <TableHead className="text-center">Pinterest Mode</TableHead>
                <TableHead className="text-center">Cover Extra</TableHead>
                <TableHead className="text-center">Section Extra</TableHead>
                <TableHead className="text-center">Content Style</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {allSites.map((site) => {
                const hasCoverExtra = !!site.pinterestCoverPromptExtra?.trim();
                const hasSectionExtra = !!site.pinterestSectionPromptExtra?.trim();
                const hasContentStyle = !!site.pinterestContentStyle?.trim();
                return (
                  <TableRow key={site.id}>
                    <TableCell className="font-medium">{site.name}</TableCell>
                    <TableCell className="text-center">
                      {site.pinterestMode ? (
                        <Badge className="border-transparent bg-green-500/20 text-green-400 hover:bg-green-500/20">
                          Enabled
                        </Badge>
                      ) : (
                        <Badge className="border-transparent bg-muted text-muted-foreground hover:bg-muted">
                          Off
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {hasCoverExtra ? (
                        <CheckCircle2 className="mx-auto h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="mx-auto h-4 w-4 text-muted-foreground" />
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {hasSectionExtra ? (
                        <CheckCircle2 className="mx-auto h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="mx-auto h-4 w-4 text-muted-foreground" />
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {hasContentStyle ? (
                        <CheckCircle2 className="mx-auto h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="mx-auto h-4 w-4 text-muted-foreground" />
                      )}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/sites/${site.id}`}
                        className="text-sm text-primary hover:underline"
                      >
                        Edit
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
