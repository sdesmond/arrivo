import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/db";
import { logAuthError } from "@/lib/auth-logger";
import { authorizeCredentials, type AuthorizedUser } from "@/lib/authorize-credentials";
import { isTokenRevoked, type SessionTokenFields } from "@/lib/session-policy";
import { getSessionState } from "@/lib/session-version";

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
        token.deviceId = user.deviceId;
        token.keepSignedIn = user.keepSignedIn ?? true;
        token.signedInAt = Date.now();
        return token;
      }
      if (!token.sub) return token;

      // Runs on every auth() call (proxy.ts, pages, actions, route handlers). Drops the token for a deleted user,
      // after a password/two-factor change or "sign out all devices", when its browser was removed, or 12 hours
      // after an unticked "Keep me signed in" (see src/lib/session-policy.ts).
      const state = await getSessionState(token.sub, token.deviceId);
      return isTokenRevoked(token, state) ? null : token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
  pages: { signIn: "/sign-in" },
});
