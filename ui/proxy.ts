import { NextRequest, NextResponse } from "next/server";

/** Default matches api SESSION_COOKIE_NAME; proxy only checks presence (coarse gate). */
const SESSION_COOKIE =
  process.env.SESSION_COOKIE_NAME?.trim() || "fh_session";

const PUBLIC_PREFIXES = [
  "/sign-in",
  "/signup",
  "/sign-up",
  "/invites",
  "/forgot-password",
  "/reset-password",
  "/verify",
  "/health",
  "/api/auth",
  "/api/lists",
  "/api/invites",
];

function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Next.js 16 proxy (replaces middleware): coarse cookie-presence redirect for
 * protected app routes only.
 *
 * Do NOT bounce /sign-in|/signup away based on cookie presence — a stale
 * fh_session after logout would loop: sign-in → lists → sign-in.
 * Fine-grained checks stay in fetchSession / layouts / api.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const session = request.cookies.get(SESSION_COOKIE)?.value;
  if (!session) {
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("returnTo", `${pathname}${search}`);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
