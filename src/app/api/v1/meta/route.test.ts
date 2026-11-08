import { expect, it, vi } from "vitest";

const { requireApiUser } = vi.hoisted(() => ({ requireApiUser: vi.fn() }));
vi.mock("@/lib/api/auth", () => ({ requireApiUser }));
import { GET } from "./route";

it("returns the API metadata as uncached JSON", async () => {
  const response = GET();
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(response.headers.get("Content-Type")).toContain("application/json");
  await expect(response.json()).resolves.toEqual({ apiVersion: 1, capabilities: ["idempotency-key"] });
});

it("never authenticates the caller", () => {
  GET();
  expect(requireApiUser).not.toHaveBeenCalled();
});
