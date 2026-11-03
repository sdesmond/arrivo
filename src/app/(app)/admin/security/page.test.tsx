// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_PASSWORD_POLICY } from "@/data/types";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  read: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("not-found");
  }),
}));
vi.mock("@/lib/auth-helpers", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/mfa-policy", () => ({ readMfaPolicy: vi.fn().mockResolvedValue({ instanceRequired: false }) }));
vi.mock("@/components/arrivo/mfa-policy-settings", () => ({ MfaPolicySettings: () => "mfa-settings" }));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/lib/password-policy-store", () => ({ readPasswordPolicyForAdmin: mocks.read }));
vi.mock("@/components/arrivo/password-policy-settings", () => ({
  PasswordPolicySettings: ({ initial }: { initial: { status: string } }) => `settings:${initial.status}`,
}));

import AdminSecurityPage from "./page";

const render = async () => renderToStaticMarkup(await AdminSecurityPage());

describe("AdminSecurityPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ id: "admin-1" });
    mocks.read.mockResolvedValue({ status: "ok", policy: DEFAULT_PASSWORD_POLICY });
  });

  it("renders the Security heading and the settings for an admin", async () => {
    const html = await render();
    expect(html).toContain("<h2");
    expect(html).toContain("Security");
    expect(html).toContain("settings:ok");
    expect(mocks.read).toHaveBeenCalledWith({}, "admin-1");
  });

  it("guards the request itself, not only the layout", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("not-found"));
    await expect(render()).rejects.toThrow("not-found");
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("is not found when the reader says admin authority is gone", async () => {
    mocks.read.mockResolvedValue({ status: "forbidden" });
    await expect(render()).rejects.toThrow("not-found");
  });

  it("renders an unavailable state when the rules cannot be read", async () => {
    mocks.read.mockRejectedValue(new Error("db down"));
    expect(await render()).toContain("settings:unavailable");
  });
});
