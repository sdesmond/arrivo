// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// Auth.js's wrapper only attaches req.auth; the proxy's own routing is what's under test. next/server is mocked
// globally (vitest.setup.mts), so requests are the plain shape the proxy reads.
vi.mock("next-auth", () => ({ default: () => ({ auth: (handler: unknown) => handler }) }));

import proxy, { config } from "./proxy";

interface ProxyRequest {
  url: string;
  headers: Headers;
  nextUrl: URL;
  auth: unknown;
}
type ProxyHandler = (req: ProxyRequest) => Response | undefined;

// The standalone server puts its own listen address in req.url; the browser's address is in Host.
function request(path: string, auth: unknown = null) {
  const url = `http://localhost:4850${path}`;
  const req = { url, headers: new Headers({ host: "192.168.1.50:4850" }), nextUrl: new URL(url), auth };
  return (proxy as unknown as ProxyHandler)(req);
}

describe("proxy", () => {
  beforeEach(() => {
    vi.stubEnv("NEXTAUTH_URL", "");
    vi.stubEnv("AUTH_URL", "");
  });

  it("sends a signed-out visitor to sign-in on the address their browser used", () => {
    expect(request("/trips")?.headers.get("location")).toBe("http://192.168.1.50:4850/sign-in");
  });

  it.each(["/trips", "/api/storage/x.jpg", "/api/users/me/events", "/account-settings"])(
    "keeps %s closed to a visitor holding only the account-setup cookie",
    (path) => {
      const url = `http://localhost:4850${path}`;
      const req = {
        url,
        headers: new Headers({ host: "192.168.1.50:4850", cookie: "arrivo_account_setup=token" }),
        nextUrl: new URL(url),
        auth: null,
      };
      expect((proxy as unknown as ProxyHandler)(req)?.headers.get("location")).toBe("http://192.168.1.50:4850/sign-in");
    }
  );

  it.each(["/account-setup", "/account-setup/open"])(
    "leaves %s public and marks it uncacheable with no referrer",
    (path) => {
      const response = request(path) as Response;
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    }
  );

  it.each(["/account-setup-admin", "/account-setupx", "/setup-link", "/sign-in-old", "/sign-upgrade"])(
    "does not treat %s as public just because it starts with a public path",
    (path) => {
      expect(request(path)?.headers.get("location")).toBe("http://192.168.1.50:4850/sign-in");
    }
  );

  it.each(["/account-setup/", "/sign-in/", "/api/auth/callback/credentials"])("leaves nested %s public", (path) => {
    expect(request(path)?.headers.get("location") ?? null).toBeNull();
  });

  it("lets a signed-in visitor through", () => {
    expect(request("/trips", { user: { id: "user-1" } })).toBeUndefined();
  });

  it.each([
    "/sign-in",
    "/setup",
    "/sign-up",
    "/api/auth/session",
    "/api/health",
    "/_next/data/x.json",
    "/favicon.svg",
    "/icon.svg",
  ])("leaves %s public", (path) => {
    expect(request(path)).toBeUndefined();
  });

  it("skips static assets entirely", () => {
    const matcher = new RegExp(`^${config.matcher[0]}$`);
    expect(matcher.test("/trips")).toBe(true);
    expect(matcher.test("/_next/static/chunk.js")).toBe(false);
    expect(matcher.test("/_next/image")).toBe(false);
    expect(matcher.test("/favicon.ico")).toBe(false);
  });
});
