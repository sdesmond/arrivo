import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";
import { browserUrl } from "@/lib/request-origin";

const PUBLIC_PATHS = ["/setup", "/sign-in", "/sign-up", "/api/auth", "/api/health"];

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
});

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
