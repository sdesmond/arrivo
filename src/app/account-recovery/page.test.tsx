// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  resolve: vi.fn(),
  start: vi.fn(),
  loadPolicy: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: mocks.get }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/admin-recovery-session", () => ({
  ADMIN_RECOVERY_COOKIE: "recovery",
  resolveAdminRecoveryContext: mocks.resolve,
}));
vi.mock("@/lib/admin-recovery-completion", () => ({ startAdminRecoveryEnrollment: mocks.start }));
vi.mock("@/lib/password-policy-store", () => ({ loadPasswordPolicy: mocks.loadPolicy }));
vi.mock("@/lib/mfa", () => ({ totpUri: () => "otpauth://totp/Arrivo:root?secret=SECRET" }));
vi.mock("./actions", () => ({ completeAdminRecoveryAction: vi.fn() }));
vi.mock("./form", () => ({
  AdminRecoveryForm: ({ secret }: { secret: string }) => `form:${secret}`,
}));

import AdminRecoveryPage from "./page";
import { DEFAULT_PASSWORD_POLICY } from "@/data/types";

const render = async (searchParams: { token?: string | string[] } = {}) =>
  renderToStaticMarkup(await AdminRecoveryPage({ searchParams: Promise.resolve(searchParams) }));

describe("AdminRecoveryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockReturnValue({ value: "cookie-token" });
    mocks.resolve.mockResolvedValue({ status: "ready" });
    mocks.start.mockResolvedValue({ ok: true, secret: "SECRET", username: "root" });
    mocks.loadPolicy.mockResolvedValue(DEFAULT_PASSWORD_POLICY);
  });

  it("hands an operator link's token to the exchange route", async () => {
    await expect(render({ token: "abc_-" })).rejects.toThrow("redirect:/account-recovery/open?token=abc_-");
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it("renders the form with the stable pending secret for a ready context", async () => {
    expect(await render()).toContain("form:SECRET");
    expect(mocks.start).toHaveBeenCalledWith(expect.anything(), "cookie-token");
  });

  it("says the rules are unavailable, without a form, when they cannot be read", async () => {
    mocks.loadPolicy.mockResolvedValue(undefined);
    const html = await render();
    expect(html).toContain("Password rules are unavailable");
    expect(html).not.toContain("form:");
  });

  it("does not read the rules for an unusable link", async () => {
    mocks.resolve.mockResolvedValue({ status: "unavailable" });
    await render().catch(() => undefined);
    expect(mocks.loadPolicy).not.toHaveBeenCalled();
  });

  it("shows the generic unavailable state without a cookie", async () => {
    mocks.get.mockReturnValue(undefined);
    mocks.resolve.mockResolvedValue({ status: "unavailable" });
    expect(await render()).toContain("Recovery link unavailable");
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("drops a stale cookie through the exchange route", async () => {
    mocks.resolve.mockResolvedValue({ status: "unavailable" });
    await expect(render()).rejects.toThrow("redirect:/account-recovery/open");
  });

  it("drops the cookie when the authorization stopped being usable", async () => {
    mocks.start.mockResolvedValue({ ok: false, reason: "unavailable" });
    await expect(render()).rejects.toThrow("redirect:/account-recovery/open");
  });

  it("explains a missing encryption key", async () => {
    mocks.start.mockResolvedValue({ ok: false, reason: "needs-key" });
    expect(await render()).toContain("DATA_ENCRYPTION_KEY");
  });

  it("asks to reload on a transient failure", async () => {
    mocks.start.mockResolvedValue({ ok: false, reason: "retry" });
    expect(await render()).toContain("Reload this page");
  });
});
