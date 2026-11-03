// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_PASSWORD_POLICY } from "@/data/types";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  resolve: vi.fn(),
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
vi.mock("@/lib/password-reset-session", () => ({
  PASSWORD_RESET_COOKIE: "reset",
  resolvePasswordResetContext: mocks.resolve,
}));
vi.mock("@/lib/password-policy-store", () => ({ loadPasswordPolicy: mocks.loadPolicy }));
vi.mock("./actions", () => ({ completePasswordResetAction: vi.fn() }));
vi.mock("./form", () => ({
  PasswordResetForm: ({ policy }: { policy: { minLength: number } }) => `form:${policy.minLength}`,
}));

import PasswordResetPage from "./page";

const render = async () => renderToStaticMarkup(await PasswordResetPage());

describe("PasswordResetPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockReturnValue({ value: "cookie-token" });
    mocks.resolve.mockResolvedValue({ status: "ready" });
    mocks.loadPolicy.mockResolvedValue(DEFAULT_PASSWORD_POLICY);
  });

  it("passes the current rules to the form for a ready link", async () => {
    expect(await render()).toContain("form:8");
  });

  it("says the rules are unavailable, without a form, when they cannot be read", async () => {
    mocks.loadPolicy.mockResolvedValue(undefined);
    const html = await render();
    expect(html).toContain("Password rules are unavailable");
    expect(html).not.toContain("form:");
  });

  it("does not read the rules for an unusable link", async () => {
    mocks.resolve.mockResolvedValue({ status: "unavailable" });
    mocks.get.mockReturnValue(undefined);
    expect(await render()).toContain("Reset link unavailable");
    expect(mocks.loadPolicy).not.toHaveBeenCalled();
  });

  it("drops a stale cookie through the exchange route", async () => {
    mocks.resolve.mockResolvedValue({ status: "unavailable" });
    await expect(render()).rejects.toThrow("redirect:/account-reset/open");
  });
});
