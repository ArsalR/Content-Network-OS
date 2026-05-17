export const dynamic = "force-dynamic";

import { db } from "@/lib/db";
import { apiCalls, drafts } from "@/db/schema";
import { sql, gte, and, eq, desc } from "drizzle-orm";
import { startOfMonth, startOfDay } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

function fmtUsd(val: string | null): string {
  const n = parseFloat(val ?? "0");
  return `$${n.toFixed(4)}`;
}

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default async function AnalyticsPage() {
  const monthStart = startOfMonth(new Date());
  const dayStart = startOfDay(new Date());

  const [monthSpendRow] = await db
    .select({ total: sql<string>`COALESCE(SUM(${apiCalls.costUsd}), 0)` })
    .from(apiCalls)
    .where(gte(apiCalls.createdAt, monthStart));

  const [todaySpendRow] = await db
    .select({ total: sql<string>`COALESCE(SUM(${apiCalls.costUsd}), 0)` })
    .from(apiCalls)
    .where(gte(apiCalls.createdAt, dayStart));

  const draftCountRows = await db
    .select({
      status: drafts.status,
      count: sql<string>`COUNT(*)`,
    })
    .from(drafts)
    .groupBy(drafts.status);

  const reviewCount =
    draftCountRows.find((r) => r.status === "review")?.count ?? "0";

  const [publishedMonthRow] = await db
    .select({ count: sql<string>`COUNT(*)` })
    .from(drafts)
    .where(
      and(
        eq(drafts.status, "published"),
        gte(drafts.createdAt, monthStart)
      )
    );

  const recentCalls = await db
    .select()
    .from(apiCalls)
    .orderBy(desc(apiCalls.createdAt))
    .limit(50);

  const todaySpend = parseFloat(todaySpendRow?.total ?? "0");
  const monthSpend = parseFloat(monthSpendRow?.total ?? "0");
  const publishedThisMonth = parseInt(publishedMonthRow?.count ?? "0", 10);
  const draftsInReview = parseInt(reviewCount, 10);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Analytics
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          API usage and content metrics
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Today's Spend" value={`$${todaySpend.toFixed(4)}`} />
        <StatCard
          label="This Month"
          value={`$${monthSpend.toFixed(4)}`}
        />
        <StatCard
          label="Drafts in Review"
          value={String(draftsInReview)}
        />
        <StatCard
          label="Published This Month"
          value={String(publishedThisMonth)}
        />
      </div>

      {/* Recent API calls */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-foreground">
          Recent API Calls
        </h2>
        {recentCalls.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">No API calls yet.</p>
          </div>
        ) : (
          <div className="rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kind</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24">Duration</TableHead>
                  <TableHead className="w-28">Cost</TableHead>
                  <TableHead className="w-20">Tokens In</TableHead>
                  <TableHead className="w-20">Tokens Out</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentCalls.map((call) => (
                  <TableRow key={call.id}>
                    <TableCell className="font-mono text-xs">
                      {call.kind}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          call.status === "success"
                            ? "border-transparent bg-green-800 text-green-200"
                            : "border-transparent bg-red-800 text-red-200"
                        }
                      >
                        {call.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {fmtMs(call.durationMs)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {fmtUsd(call.costUsd)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {call.tokensIn ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {call.tokensOut ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {call.createdAt.toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
    </div>
  );
}
