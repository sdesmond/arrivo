import { expect, it, vi } from "vitest";
const { auth } = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@/auth", () => ({ auth }));
import { requireApiUser } from "./auth";
it("rejects absent, revoked, and enrollment-only sessions", async () => {
  for (const session of [null, { user: {} }]) {
    auth.mockResolvedValue(session);
    await expect(requireApiUser()).rejects.toMatchObject({ status: 401, code: "unauthenticated" });
  }
  auth.mockResolvedValue({ user: { id: "user", mfaEnrollmentRequired: true } });
  await expect(requireApiUser()).rejects.toMatchObject({ status: 403, code: "mfa_enrollment_required" });
});
it("returns an explicit actor", async () => {
  auth.mockResolvedValue({ user: { id: "user" } });
  await expect(requireApiUser()).resolves.toEqual({ userId: "user" });
});
