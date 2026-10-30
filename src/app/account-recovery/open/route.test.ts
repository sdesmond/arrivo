// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolveAdminRecoveryContext } = vi.hoisted(() => ({ resolveAdminRecoveryContext: vi.fn() }));
vi.mock("@/lib/admin-recovery-session", async () => {
  const actual = await vi.importActual<typeof import("@/lib/admin-recovery-session")>("@/lib/admin-recovery-session");
  return { ...actual, resolveAdminRecoveryContext };
});

import { GET } from "./route";

const TOKEN = "b".repeat(43);
const expiresAt = new Date(Date.now() + 3_600_000).toISOString();

function exchange(query = `?token=${TOKEN}`, headers: Record<string, string> = {}) {
  return GET(
    new Request(`http://localhost:4850/account-recovery/open${query}`, {
      headers: { host: "192.0.2.50:4850", ...headers },
    })
  );
}

describe("GET /account-recovery/open", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXTAUTH_URL", "");
    vi.stubEnv("AUTH_URL", "");
    resolveAdminRecoveryContext.mockResolvedValue({
      status: "ready",
      account: { userId: "user-1", username: "pending", purpose: "recovery", expiresAt },
    });
  });

  it("sets the limited cookie and redirects to a token-free URL on the browser's address", async () => {
    const response = await exchange();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://192.0.2.50:4850/account-recovery");
    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toContain(`arrivo_admin_recovery=${TOKEN}`);
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
    expect(resolveAdminRecoveryContext).toHaveBeenCalledWith(TOKEN, {
      headers: expect.any(Headers),
      attempt: "exchange",
    });
  });

  it("marks the cookie Secure over HTTPS", async () => {
    const response = await exchange(undefined, { "x-forwarded-proto": "https" });
    expect(response.headers.get("set-cookie")).toContain("Secure");
  });

  it("clears the cookie and gives no hint when the link is unusable", async () => {
    resolveAdminRecoveryContext.mockResolvedValue({ status: "unavailable" });
    const response = await exchange();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://192.0.2.50:4850/account-recovery");
    expect(response.headers.get("set-cookie")).toContain("arrivo_admin_recovery=;");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).not.toContain(TOKEN);
  });

  it("only clears the cookie when called without a token", async () => {
    resolveAdminRecoveryContext.mockResolvedValue({ status: "unavailable" });
    const response = await exchange("");
    expect(resolveAdminRecoveryContext).toHaveBeenCalledWith(undefined, expect.anything());
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
