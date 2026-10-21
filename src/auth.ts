import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/db";
import { logAuthError } from "@/lib/auth-logger";
import { authorizeCredentials, type AuthorizedUser } from "@/lib/authorize-credentials";
import { getSessionVersion } from "@/lib/session-version";

declare module "next-auth" {
  interface User {
    sessionVersion?: number;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    sessionVersion?: number;
  }
}

export const { auth, signIn, signOut, handlers } = NextAuth({
  adapter: DrizzleAdapter(db),
  session: { strategy: "jwt" },
  logger: { error: logAuthError },
  // JWT avoids a session table; revocation works through users.session_version (see the jwt callback).
  providers: [
    Credentials({
      credentials: { email: {}, password: {}, mfaTicket: {}, code: {} },
      authorize: (credentials, request): Promise<AuthorizedUser | null> => authorizeCredentials(credentials, request),
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
        token.sessionVersion = user.sessionVersion ?? 0;
        return token;
      }
      if (!token.sub) return token;

      // Runs on every auth() call (proxy.ts, pages, actions, route handlers). A token from before the last
      // password change, two-factor change or "sign out all devices" — or for a deleted user — is dropped.
      // Tokens issued before session versions existed carry none and count as version 0, the column default.
      const currentVersion = await getSessionVersion(token.sub);
      if (currentVersion === undefined || currentVersion !== (token.sessionVersion ?? 0)) return null;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
  pages: { signIn: "/sign-in" },
});
