export const dynamic = "force-dynamic";

import Link from "next/link";
import { db } from "@/lib/db";
import { sites } from "@/db/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus } from "lucide-react";
import { format } from "date-fns";

export default async function SitesPage() {
  const allSites = await db.select().from(sites).orderBy(sites.createdAt);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Sites</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your WordPress sites and API connections
          </p>
        </div>
        <Button asChild>
          <Link href="/sites/new">
            <Plus className="mr-2 h-4 w-4" />
            Add site
          </Link>
        </Button>
      </div>

      {allSites.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No sites yet. Add your first site to get started.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Hostname</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {allSites.map((site) => (
                <TableRow key={site.id}>
                  <TableCell className="font-medium">{site.name}</TableCell>
                  <TableCell className="text-muted-foreground">{site.hostname}</TableCell>
                  <TableCell>
                    <StatusBadge status={site.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {format(site.createdAt, "MMM d, yyyy")}
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
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: "active" | "paused" | "error" }) {
  if (status === "active") {
    return (
      <Badge className="border-transparent bg-green-500/20 text-green-400 hover:bg-green-500/20">
        Active
      </Badge>
    );
  }
  if (status === "paused") {
    return (
      <Badge className="border-transparent bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/20">
        Paused
      </Badge>
    );
  }
  return (
    <Badge className="border-transparent bg-red-500/20 text-red-400 hover:bg-red-500/20">
      Error
    </Badge>
  );
}
