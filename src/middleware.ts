import { betterFetch } from "@better-fetch/fetch";
import type { Session } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const { data: session } = await betterFetch<Session>(
    "/api/auth/get-session",
    {
      baseURL: request.nextUrl.origin,
      headers: { cookie: request.headers.get("cookie") ?? "" },
      timeout: 5000,
    }
  ).catch(() => ({ data: null }));

  const { pathname } = request.nextUrl;
  const isAuthRoute = pathname.startsWith("/login") || pathname.startsWith("/setup");
  const isAppRoute =
    !isAuthRoute && !pathname.startsWith("/api");

  if (!session && isAppRoute) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (session && isAuthRoute) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Never run middleware on static assets or API routes.
  // API routes handle their own auth; intercepting /api/auth/* would cause
  // the middleware's own betterFetch("/api/auth/get-session") call to loop.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"],
};
