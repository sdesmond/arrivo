import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/db";
import { authConfig } from "@/auth.config";
import { authorizeCredentials, type AuthorizedUser } from "@/lib/authorize-credentials";
import { isTokenRevoked } from "@/lib/session-policy";
import { readMfaPolicy } from "@/lib/mfa-policy";
import { getSessionState } from "@/lib/session-version";

export const { auth, signIn, signOut, handlers } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db),
  // JWT avoids a session table; revocation works through users.session_version (see the jwt callback).
  providers: [
    Credentials({
      credentials: { username: {}, password: {}, mfaTicket: {}, code: {} },
      authorize: (credentials, request): Promise<AuthorizedUser | null> => authorizeCredentials(credentials, request),
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
        token.mfaEnrollmentRequired = user.mfaEnrollmentRequired;
        token.sessionVersion = user.sessionVersion ?? 0;
        token.deviceId = user.deviceId;
        token.keepSignedIn = user.keepSignedIn ?? true;
        token.signedInAt = Date.now();
        return token;
      }
      if (!token.sub) return token;

      // Runs on every auth() call from pages, actions and route handlers (src/proxy.ts uses the database-free
      // src/auth.config.ts instead). Drops the token for a deleted user, after a password/two-factor change or
      // "sign out all devices", when its browser was removed, or 12 hours after an unticked "Keep me signed in"
      // (see src/lib/session-policy.ts).
      try {
        const state = await getSessionState(token.sub, token.deviceId);
        if (isTokenRevoked(token, state)) return null;
        if (token.mfaEnrollmentRequired) {
          const policy = await readMfaPolicy(db, token.sub);
          if (policy.sessionVersion !== token.sessionVersion || policy.enrolled) return null;
          token.mfaEnrollmentRequired = policy.required;
        }
        return token;
      } catch {
        return null;
      }
    },
  },
});
