// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const { rows, select } = vi.hoisted(() => {
  const rows = vi.fn();
  return { rows, select: vi.fn(() => ({ from: () => ({ where: rows }) })) };
});
vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: { select } }));
import { isInstanceSetupOpen } from "./instance-setup";
describe("isInstanceSetupOpen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it("opens only for an explicitly fresh singleton", async () => {
    rows.mockResolvedValue([{ initializedAt: null }]);
    await expect(isInstanceSetupOpen()).resolves.toBe(true);
  });
  it("closes for initialized singleton", async () => {
    rows.mockResolvedValue([{ initializedAt: new Date() }]);
    await expect(isInstanceSetupOpen()).resolves.toBe(false);
  });
  it("fails closed when singleton is missing", async () => {
    rows.mockResolvedValue([]);
    await expect(isInstanceSetupOpen()).resolves.toBe(false);
  });
  it("propagates database failures", async () => {
    rows.mockRejectedValue(new Error("db down"));
    await expect(isInstanceSetupOpen()).rejects.toThrow("db down");
  });
});
