// Decides whether a signed-in token is still good. Kept free of I/O so the rules are unit-tested; the jwt
// callback in src/auth.ts loads the state with getSessionState() and drops the token when this says so.

// "Keep me signed in" unticked: signed out this long after signing in. (A cookie that ends when the browser
// closes isn't possible here: Auth.js re-issues the session cookie with a fresh expiry on every request.)
export const SHORT_SESSION_MS = 12 * 60 * 60 * 1000;

export interface SessionTokenFields {
  sessionVersion?: number;
  deviceId?: string;
  keepSignedIn?: boolean;
  signedInAt?: number;
}

export interface SessionState {
  sessionVersion: number;
  deviceActive: boolean;
}

// The only rule that needs no database, so src/proxy.ts applies it on every request. Fields missing on tokens from
// before "Keep me signed in" existed count as kept.
export function isShortSessionExpired(token: SessionTokenFields, now = Date.now()): boolean {
  return token.keepSignedIn === false && token.signedInAt !== undefined && now - token.signedInAt > SHORT_SESSION_MS;
}

export function isTokenRevoked(token: SessionTokenFields, state: SessionState | undefined, now = Date.now()): boolean {
  // Deleted user, or signed out everywhere since this token was issued.
  if (!state || state.sessionVersion !== (token.sessionVersion ?? 0)) return true;
  // This browser was removed under Profile → Security. Tokens from before browsers were tracked have no id.
  if (token.deviceId && !state.deviceActive) return true;
  return isShortSessionExpired(token, now);
}
