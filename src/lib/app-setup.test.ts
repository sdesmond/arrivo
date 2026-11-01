// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const { rows, select } = vi.hoisted(() => {
  const rows = vi.fn();
  return { rows, select: vi.fn(() => ({ from: () => ({ where: rows }) })) };
});
vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: { select } }));
import { isAppSetupOpen } from "./app-setup";
describe("isAppSetupOpen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it("opens only for an explicitly fresh singleton", async () => {
    rows.mockResolvedValue([{ initializedAt: null }]);
    await expect(isAppSetupOpen()).resolves.toBe(true);
  });
  it("closes for initialized singleton", async () => {
    rows.mockResolvedValue([{ initializedAt: new Date() }]);
    await expect(isAppSetupOpen()).resolves.toBe(false);
  });
  it("fails closed when singleton is missing", async () => {
    rows.mockResolvedValue([]);
    await expect(isAppSetupOpen()).resolves.toBe(false);
  });
  it("propagates database failures", async () => {
    rows.mockRejectedValue(new Error("db down"));
    await expect(isAppSetupOpen()).rejects.toThrow("db down");
  });
});
