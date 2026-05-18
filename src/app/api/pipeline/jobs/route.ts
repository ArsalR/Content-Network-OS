export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { jobs } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { headers } from "next/headers";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select()
    .from(jobs)
    .where(eq(jobs.kind, "generate-draft-with-images"))
    .orderBy(desc(jobs.createdAt))
    .limit(50);

  return NextResponse.json({ jobs: rows });
}
