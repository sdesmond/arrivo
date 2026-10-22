// @vitest-environment node
import { describe, expect, it } from "vitest";
import { authConfig } from "./auth.config";
import { SHORT_SESSION_MS } from "./lib/session-policy";

type JwtArgs = Parameters<typeof authConfig.callbacks.jwt>[0];
type SessionArgs = Parameters<typeof authConfig.callbacks.session>[0];

const jwt = (token: JwtArgs["token"]) => authConfig.callbacks.jwt({ token } as JwtArgs);

describe("authConfig (the proxy's database-free config)", () => {
  it("drops an unticked Keep me signed in session after 12 hours", () => {
    expect(jwt({ sub: "user-1", keepSignedIn: false, signedInAt: Date.now() - SHORT_SESSION_MS - 1000 })).toBeNull();
  });

  it("keeps and re-issues a current or kept session unchanged", () => {
    const fresh = { sub: "user-1", keepSignedIn: false, signedInAt: Date.now() };
    const kept = { sub: "user-1", keepSignedIn: true, signedInAt: 0 };
    expect(jwt(fresh)).toBe(fresh);
    expect(jwt(kept)).toBe(kept);
  });

  it("copies the user id from the token into the session", () => {
    const session = { user: {}, expires: "" } as SessionArgs["session"];
    expect(authConfig.callbacks.session({ session, token: { sub: "user-1" } } as SessionArgs).user.id).toBe("user-1");
    expect(authConfig.callbacks.session({ session: { user: {}, expires: "" }, token: {} } as SessionArgs).user.id).toBe(
      undefined
    );
  });

  it("has no providers or adapter, so the proxy never loads the database", () => {
    expect(authConfig.providers).toEqual([]);
    expect("adapter" in authConfig).toBe(false);
  });
});
