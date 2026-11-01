// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  complete: vi.fn(),
  record: vi.fn(),
  hash: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
  after: vi.fn(),
}));
vi.mock("@/lib/password-reset-session", () => ({
  PASSWORD_RESET_COOKIE: "reset",
  PASSWORD_RESET_COOKIE_PATH: "/account-reset",
  resolvePasswordResetContext: mocks.resolve,
}));
vi.mock("@/lib/password-reset", () => ({ completePasswordReset: mocks.complete }));
vi.mock("@/lib/activity", () => ({ recordActivity: mocks.record }));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("bcryptjs", () => ({ default: { hash: mocks.hash } }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: mocks.get, set: mocks.set }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
import { completePasswordResetAction } from "./actions";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockReturnValue({ value: "token" });
  mocks.resolve.mockResolvedValue({ status: "ready" });
  mocks.hash.mockResolvedValue("hash");
  mocks.complete.mockResolvedValue({ ok: true, userId: "user", username: "alex" });
});
function form(password: string, confirmation = password) {
  const data = new FormData();
  data.set("password", password);
  data.set("confirmPassword", confirmation);
  return data;
}
it("validates passwords before changing credentials", async () => {
  expect(await completePasswordResetAction(undefined, form("long-enough-password", "different"))).toMatchObject({
    field: "confirmPassword",
  });
  expect(mocks.complete).not.toHaveBeenCalled();
});
it("completes the reset and returns to sign-in without logging secrets", async () => {
  await expect(completePasswordResetAction(undefined, form("long-enough-password"))).rejects.toThrow(
    "redirect:/sign-in"
  );
  expect(mocks.complete).toHaveBeenCalledWith(expect.anything(), { token: "token", passwordHash: "hash" });
  expect(JSON.stringify(mocks.record.mock.calls)).not.toMatch(/token|hash|long-enough-password/);
});
it("rejects unavailable contexts without writing", async () => {
  mocks.resolve.mockResolvedValue({ status: "unavailable" });
  await expect(completePasswordResetAction(undefined, form("long-enough-password"))).rejects.toThrow(
    "redirect:/account-reset"
  );
  expect(mocks.complete).not.toHaveBeenCalled();
});
it("still succeeds when Activity scheduling fails", async () => {
  const actual = await vi.importActual<typeof import("@/lib/activity")>("@/lib/activity");
  mocks.record.mockImplementation(actual.recordActivity);
  mocks.after.mockImplementation(() => {
    throw new Error("unavailable");
  });
  const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  await expect(completePasswordResetAction(undefined, form("long-enough-password"))).rejects.toThrow(
    "redirect:/sign-in"
  );
  expect(mocks.complete).toHaveBeenCalledOnce();
  log.mockRestore();
  mocks.record.mockReset();
});
