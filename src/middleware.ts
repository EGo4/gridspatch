import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const PUBLIC_PATHS = ["/login", "/api/auth"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Optimistic check: confirms a session cookie is present, not that it is
  // valid. A forged cookie value passes this. Real verification happens at
  // the page/action layer (requireSession()/requireAdmin() in roles.ts) —
  // every mutating action already calls one of those. See the board.ts note
  // in CLAUDE.md: it has no page to guard it, so it calls requireSession()
  // itself on every export specifically because this check is spoofable.
  if (!getSessionCookie(request)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
