// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
const guard = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth-helpers", () => ({ requireEnrollmentUser: guard }));
vi.mock("./form", () => ({ MfaEnrollmentForm: () => null }));
import { redirect } from "next/navigation";
import Page from "./page";
describe("mandatory enrollment page", () => {
  it("admits only authenticated enrollment sessions", async () => {
    guard.mockRejectedValueOnce(new Error("unauthenticated"));
    await expect(Page()).rejects.toThrow("unauthenticated");
    guard.mockResolvedValueOnce({ id: "user", mfaEnrollmentRequired: true });
    expect(await Page()).toBeTruthy();
  });
  it("returns ordinary sessions to app", async () => {
    guard.mockResolvedValueOnce({ id: "user" });
    await Page();
    expect(redirect).toHaveBeenCalledWith("/trips");
  });
});
