import type { NextAuthConfig } from "next-auth";
import { logAuthError } from "@/lib/auth-logger";
import { isShortSessionExpired, type SessionTokenFields } from "@/lib/session-policy";

declare module "next-auth" {
  interface User {
    sessionVersion?: number;
    deviceId?: string;
    keepSignedIn?: boolean;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    sessionVersion?: SessionTokenFields["sessionVersion"];
    deviceId?: SessionTokenFields["deviceId"];
    keepSignedIn?: SessionTokenFields["keepSignedIn"];
    signedInAt?: SessionTokenFields["signedInAt"];
  }
}

// The database-free half of the Auth.js setup (the "split config" pattern). src/proxy.ts runs this on every
// request, so its jwt callback only applies the 12-hour "Keep me signed in" cutoff and re-issues the cookie to
// keep kept sessions sliding; src/auth.ts adds the provider, the adapter and the database-backed revocation
// check that pages and server actions run.
export const authConfig = {
  session: { strategy: "jwt" },
  logger: { error: logAuthError },
  providers: [],
  callbacks: {
    jwt: ({ token }) => (isShortSessionExpired(token) ? null : token),
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
  pages: { signIn: "/sign-in" },
} satisfies NextAuthConfig;
