import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jobs } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db
    .select()
    .from(jobs)
    .where(eq(jobs.kind, "generate-draft-with-images"))
    .orderBy(desc(jobs.createdAt))
    .limit(50);

  return NextResponse.json({ jobs: rows });
}
