import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";
import { browserUrl } from "@/lib/request-origin";

// `/account-setup` is listed on its own: `/setup` is a prefix match and does not cover it.
const PUBLIC_PATHS = ["/setup", "/account-setup", "/sign-in", "/sign-up", "/api/auth", "/api/health"];

// The database-free config: this runs on every request, so it only checks the JWT (and re-issues it, which keeps
// "Keep me signed in" sessions sliding). Revocation is checked by requireUser() in pages and server actions.
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isPublic =
    PUBLIC_PATHS.some((path) => pathname.startsWith(path)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname === "/icon.svg";
  if (!req.auth && !isPublic) {
    return NextResponse.redirect(browserUrl("/sign-in", req));
  }
  // Setup links carry a credential: nothing on this route may be cached or leak a Referer.
  if (pathname === "/account-setup" || pathname.startsWith("/account-setup/")) {
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  }
});

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
