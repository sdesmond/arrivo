import { describe, expect, it, vi } from "vitest";
import type { Page, Response } from "@playwright/test";
import { reloadPage } from "./page-reload";

const abort = new Error("page.reload: net::ERR_ABORTED; maybe frame was detached?");

function fakePage(reload: ReturnType<typeof vi.fn>) {
  return { reload } as unknown as Page;
}

describe("reloadPage", () => {
  it("returns the reload's response when it loads", async () => {
    const response = { status: () => 200 } as unknown as Response;
    const reload = vi.fn().mockResolvedValue(response);

    await expect(reloadPage(fakePage(reload))).resolves.toBe(response);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("reloads again when the router's fallback navigation aborts the reload", async () => {
    const response = { status: () => 200 } as unknown as Response;
    const reload = vi.fn().mockRejectedValueOnce(abort).mockResolvedValue(response);

    await expect(reloadPage(fakePage(reload))).resolves.toBe(response);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("does not retry other failures", async () => {
    const timeout = new Error("page.reload: Timeout 30000ms exceeded.");
    const reload = vi.fn().mockRejectedValue(timeout);

    await expect(reloadPage(fakePage(reload))).rejects.toBe(timeout);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("throws the abort once the attempts run out", async () => {
    const reload = vi.fn().mockRejectedValue(abort);

    await expect(reloadPage(fakePage(reload))).rejects.toBe(abort);
    expect(reload).toHaveBeenCalledTimes(3);
  });
});
