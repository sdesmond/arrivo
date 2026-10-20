import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { browserUrl } from "@/lib/request-origin";

const PUBLIC_PATHS = ["/sign-in", "/sign-up", "/api/auth", "/api/health"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isPublic =
    PUBLIC_PATHS.some((path) => pathname.startsWith(path)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon");
  if (!req.auth && !isPublic) {
    return NextResponse.redirect(browserUrl("/sign-in", req));
  }
});

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
