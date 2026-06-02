import { auth } from "@/auth";
import { NextResponse } from "next/server";

const PUBLIC_PATHS = ["/sign-in", "/sign-up", "/api/auth"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isPublic =
    PUBLIC_PATHS.some((path) => pathname.startsWith(path)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon");
  if (!req.auth && !isPublic) {
    return NextResponse.redirect(new URL("/sign-in", req.url));
  }
});

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
