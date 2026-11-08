import { expect, it, vi } from "vitest";
import type { Page, Response } from "@playwright/test";
import { waitForApiResponse } from "./api-response";
function response(method: string, path: string, status = 200) {
  return {
    request: () => ({ method: () => method }),
    url: () => "http://arrivo.test" + path,
    ok: () => status >= 200 && status < 300,
    status: () => status,
  } as Response;
}
it("matches exact method and pathname, ignoring query strings", async () => {
  const result = response("PATCH", "/api/v1/items/item?x=1");
  const waitForResponse = vi.fn<Page["waitForResponse"]>().mockResolvedValue(result);
  await expect(
    waitForApiResponse({ waitForResponse } as unknown as Page, { method: "PATCH", path: "/api/v1/items/item" })
  ).resolves.toBe(result);
  const predicate = waitForResponse.mock.calls[0][0];
  if (typeof predicate !== "function") throw new Error("predicate required");
  expect(predicate(result)).toBe(true);
  expect(predicate(response("POST", "/api/v1/items/item"))).toBe(false);
  expect(predicate(response("PATCH", "/api/v1/items/item2"))).toBe(false);
  expect(waitForResponse.mock.calls[0][1]).toEqual({ timeout: 5000 });
});
it("propagates timeout and rejects unsuccessful responses", async () => {
  const waitForResponse = vi
    .fn<Page["waitForResponse"]>()
    .mockRejectedValueOnce(new Error("timeout"))
    .mockResolvedValueOnce(response("PATCH", "/api/v1/items/item", 403));
  const page = { waitForResponse } as unknown as Page;
  await expect(
    waitForApiResponse(page, { method: "PATCH", path: "/api/v1/items/item", timeoutMs: 30 })
  ).rejects.toThrow("timeout");
  expect(waitForResponse.mock.calls[0][1]).toEqual({ timeout: 30 });
  await expect(waitForApiResponse(page, { method: "PATCH", path: "/api/v1/items/item" })).rejects.toThrow("status 403");
});
