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
  readPolicy: vi.fn(),
}));
vi.mock("@/lib/admin-recovery-session", () => ({
  ADMIN_RECOVERY_COOKIE: "recovery",
  ADMIN_RECOVERY_COOKIE_PATH: "/account-recovery",
  resolveAdminRecoveryContext: mocks.resolve,
}));
vi.mock("@/lib/admin-recovery-completion", () => ({ completeAdminRecovery: mocks.complete }));
vi.mock("@/lib/activity", () => ({ recordActivity: mocks.record }));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("bcryptjs", () => ({ default: { hash: mocks.hash } }));
vi.mock("@/lib/password-policy-store", () => ({ readPasswordPolicy: mocks.readPolicy }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: mocks.get, set: mocks.set }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
import { completeAdminRecoveryAction } from "./actions";
import { DEFAULT_PASSWORD_POLICY } from "@/data/types";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockReturnValue({ value: "token" });
  mocks.resolve.mockResolvedValue({ status: "ready" });
  mocks.hash.mockResolvedValue("hash");
  mocks.readPolicy.mockResolvedValue(DEFAULT_PASSWORD_POLICY);
  mocks.complete.mockResolvedValue({ ok: true, userId: "user", username: "root", recoveryCodes: ["aaaaa-bbbbb"] });
});
function form(password: string, confirmation = password, code = "123456") {
  const data = new FormData();
  data.set("password", password);
  data.set("confirmPassword", confirmation);
  data.set("code", code);
  return data;
}

it("rejects a malformed code before spending throttle budget or changing credentials", async () => {
  expect(await completeAdminRecoveryAction(undefined, form("long-enough-password", undefined, "12"))).toMatchObject({
    field: "code",
  });
  expect(mocks.resolve).not.toHaveBeenCalled();
  expect(mocks.complete).not.toHaveBeenCalled();
});

it("validates the password against the stored rules before hashing or changing credentials", async () => {
  expect(await completeAdminRecoveryAction(undefined, form("short"))).toEqual({
    error: "Password must be 8 to 20 characters.",
    field: "password",
    policy: DEFAULT_PASSWORD_POLICY,
  });
  expect(await completeAdminRecoveryAction(undefined, form("long-enough-password", "different"))).toMatchObject({
    field: "confirmPassword",
  });
  expect(mocks.hash).not.toHaveBeenCalled();
  expect(mocks.complete).not.toHaveBeenCalled();
});

it("reads the rules only after the link checks and refuses safely when they are unreadable", async () => {
  mocks.resolve.mockResolvedValue({ status: "unavailable" });
  await expect(completeAdminRecoveryAction(undefined, form("short"))).rejects.toThrow("redirect:/account-recovery");
  expect(mocks.readPolicy).not.toHaveBeenCalled();

  mocks.resolve.mockResolvedValue({ status: "ready" });
  mocks.readPolicy.mockRejectedValue(new Error("db down"));
  const result = await completeAdminRecoveryAction(undefined, form("long-enough-password"));
  expect(result).toMatchObject({ field: "password" });
  expect(mocks.hash).not.toHaveBeenCalled();
  expect(mocks.complete).not.toHaveBeenCalled();
});

it("completes recovery, returns codes once and records secret-free Activity", async () => {
  const result = await completeAdminRecoveryAction(undefined, form("long-enough-password", undefined, "123 456"));
  expect(result).toEqual({ recoveryCodes: ["aaaaa-bbbbb"] });
  expect(mocks.resolve).toHaveBeenCalledWith("token", { headers: expect.any(Headers), attempt: "submit" });
  expect(mocks.complete).toHaveBeenCalledWith(expect.anything(), {
    token: "token",
    passwordHash: "hash",
    code: "123 456",
  });
  expect(mocks.record).toHaveBeenCalledWith({
    type: "admin_recovery_completed",
    actor: { id: "user", username: "root" },
  });
  expect(JSON.stringify(mocks.record.mock.calls)).not.toMatch(/token|hash|long-enough-password|aaaaa|123456/);
  expect(mocks.set).not.toHaveBeenCalled();
});

it("keeps the form usable with an accessible error on a wrong code", async () => {
  mocks.complete.mockResolvedValue({ ok: false, reason: "invalid-code" });
  expect(await completeAdminRecoveryAction(undefined, form("long-enough-password"))).toMatchObject({ field: "code" });
  expect(mocks.record).not.toHaveBeenCalled();
});

it("asks to try again on a retryable conflict", async () => {
  mocks.complete.mockResolvedValue({ ok: false, reason: "retry" });
  expect(await completeAdminRecoveryAction(undefined, form("long-enough-password"))).toEqual({
    error: "Something went wrong. Try again.",
    field: "password",
  });
});

it("shows the generic unavailable state when completion is refused", async () => {
  mocks.complete.mockResolvedValue({ ok: false, reason: "unavailable" });
  await expect(completeAdminRecoveryAction(undefined, form("long-enough-password"))).rejects.toThrow(
    "redirect:/account-recovery"
  );
  expect(mocks.set).toHaveBeenCalledWith("recovery", "", expect.objectContaining({ maxAge: 0, httpOnly: true }));
  expect(mocks.record).not.toHaveBeenCalled();
});

it.each([
  ["unavailable context", { status: "unavailable" }, "token"],
  ["missing cookie", { status: "ready" }, undefined],
])("rejects %s without hashing or writing", async (_name, context, cookie) => {
  mocks.resolve.mockResolvedValue(context);
  mocks.get.mockReturnValue(cookie ? { value: cookie } : undefined);
  await expect(completeAdminRecoveryAction(undefined, form("long-enough-password"))).rejects.toThrow(
    "redirect:/account-recovery"
  );
  expect(mocks.hash).not.toHaveBeenCalled();
  expect(mocks.complete).not.toHaveBeenCalled();
});
