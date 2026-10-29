// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolvePasswordResetContext } = vi.hoisted(() => ({ resolvePasswordResetContext: vi.fn() }));
vi.mock("@/lib/password-reset-session", async () => {
  const actual = await vi.importActual<typeof import("@/lib/password-reset-session")>("@/lib/password-reset-session");
  return { ...actual, resolvePasswordResetContext };
});

import { GET } from "./route";

const TOKEN = "b".repeat(43);
const expiresAt = new Date(Date.now() + 3_600_000).toISOString();

function exchange(query = `?token=${TOKEN}`, headers: Record<string, string> = {}) {
  return GET(
    new Request(`http://localhost:4850/account-reset/open${query}`, {
      headers: { host: "192.0.2.50:4850", ...headers },
    })
  );
}

describe("GET /account-reset/open", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXTAUTH_URL", "");
    vi.stubEnv("AUTH_URL", "");
    resolvePasswordResetContext.mockResolvedValue({
      status: "ready",
      account: { userId: "user-1", username: "pending", purpose: "reset", expiresAt },
    });
  });

  it("sets the limited cookie and redirects to a token-free URL on the browser's address", async () => {
    const response = await exchange();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://192.0.2.50:4850/account-reset");
    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toContain(`arrivo_password_reset=${TOKEN}`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toContain("Secure");
    expect(Number(/Max-Age=(\d+)/.exec(cookie)![1])).toBeLessThanOrEqual(3600);
    expect(response.headers.get("location")).not.toContain("?");
  });

  it("sends no-store and no-referrer", async () => {
    const response = await exchange();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("counts the exchange and passes the request headers for throttling", async () => {
    await exchange(undefined, { "x-forwarded-for": "203.0.113.9" });
    expect(resolvePasswordResetContext).toHaveBeenCalledWith(TOKEN, {
      headers: expect.any(Headers),
      attempt: "exchange",
    });
  });

  it("marks the cookie Secure over HTTPS", async () => {
    const response = await exchange(undefined, { "x-forwarded-proto": "https" });
    expect(response.headers.get("set-cookie")).toContain("Secure");
  });

  it("clears the cookie and gives no hint when the link is unusable", async () => {
    resolvePasswordResetContext.mockResolvedValue({ status: "unavailable" });
    const response = await exchange();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://192.0.2.50:4850/account-reset");
    expect(response.headers.get("set-cookie")).toContain("arrivo_password_reset=;");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).not.toContain(TOKEN);
  });

  it("only clears the cookie when called without a token", async () => {
    resolvePasswordResetContext.mockResolvedValue({ status: "unavailable" });
    const response = await exchange("");
    expect(resolvePasswordResetContext).toHaveBeenCalledWith(undefined, expect.anything());
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
