// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { checkHealth } from "./health";

describe("checkHealth", () => {
  it("reports ok when the database answers", async () => {
    const ping = vi.fn(async () => [{ "?column?": 1 }]);

    await expect(checkHealth(ping)).resolves.toEqual({ status: 200, body: { status: "ok" } });
    expect(ping).toHaveBeenCalledOnce();
  });

  it("reports 503 when the database query fails", async () => {
    const ping = vi.fn(async () => {
      throw new Error("connect ECONNREFUSED");
    });

    await expect(checkHealth(ping)).resolves.toEqual({ status: 503, body: { status: "error" } });
  });
});
