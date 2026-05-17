export const dynamic = "force-dynamic";

import { Globe, FolderOpen, FileText, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { sites, projects, drafts } from "@/db/schema";
import { eq, and, gte, count } from "drizzle-orm";
import { startOfMonth } from "date-fns";

export default async function DashboardPage() {
  const monthStart = startOfMonth(new Date());

  const [siteCount] = await db.select({ count: count() }).from(sites);
  const [activeProjectCount] = await db
    .select({ count: count() })
    .from(projects)
    .where(eq(projects.status, "active"));
  const [draftsInReviewCount] = await db
    .select({ count: count() })
    .from(drafts)
    .where(eq(drafts.status, "review"));
  const [publishedThisMonthCount] = await db
    .select({ count: count() })
    .from(drafts)
    .where(
      and(
        eq(drafts.status, "published"),
        gte(drafts.publishedAt, monthStart)
      )
    );

  const stats = [
    {
      label: "Total Sites",
      value: siteCount?.count ?? 0,
      icon: Globe,
    },
    {
      label: "Active Projects",
      value: activeProjectCount?.count ?? 0,
      icon: FolderOpen,
    },
    {
      label: "Drafts in Review",
      value: draftsInReviewCount?.count ?? 0,
      icon: FileText,
    },
    {
      label: "Published This Month",
      value: publishedThisMonthCount?.count ?? 0,
      icon: TrendingUp,
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Content Network OS
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your AI content production studio
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {label}
              </CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="rounded-lg border border-dashed border-border p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Connect your first site to get started.
        </p>
      </div>
    </div>
  );
}
