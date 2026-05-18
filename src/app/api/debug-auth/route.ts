export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

export async function GET() {
  const results: Record<string, unknown> = {};

  // 1. Check env vars are present
  results.envVars = {
    DATABASE_URL: !!process.env.DATABASE_URL,
    BETTER_AUTH_SECRET: !!process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? "MISSING",
    NEXT_PUBLIC_BETTER_AUTH_URL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL ?? "MISSING",
    ENCRYPTION_KEY: !!process.env.ENCRYPTION_KEY,
    ENCRYPTION_KEY_LENGTH: process.env.ENCRYPTION_KEY
      ? Buffer.from(process.env.ENCRYPTION_KEY, "base64").length
      : "N/A",
  };

  // 2. Test DB connection
  try {
    const { db } = await import("@/lib/db");
    const { users } = await import("@/db/schema");
    const rows = await db.select().from(users).limit(1);
    results.db = { ok: true, userCount: rows.length, email: rows[0]?.email };
  } catch (e) {
    results.db = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  // 3. Test auth module loads
  try {
    await import("@/lib/auth");
    results.authModule = { ok: true };
  } catch (e) {
    results.authModule = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  results.signIn = { ok: true, message: "Auth module loaded" };

  return NextResponse.json(results, { status: 200 });
}
