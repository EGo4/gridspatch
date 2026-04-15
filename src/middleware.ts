import { NextRequest, NextResponse } from "next/server";
import { betterFetch } from "@better-fetch/fetch";

type SessionResponse = {
  user: { id: string; email: string; name: string; role: string };
  session: { id: string; userId: string; expiresAt: string };
};

const PUBLIC_PATHS = ["/login", "/api/auth"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const { data: session } = await betterFetch<SessionResponse>(
    "/api/auth/get-session",
    {
      baseURL: request.nextUrl.origin,
      headers: { cookie: request.headers.get("cookie") ?? "" },
    },
  );

  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|uploads/).*)",
  ],
};
