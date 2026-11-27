import { describe, expect, it, vi } from "vitest";
import type { Page, Response } from "@playwright/test";
import { waitForServerActionResponse } from "./server-action";

describe("waitForServerActionResponse", () => {
  const responseWithStatus = (status: number, redirect?: string) => ({
    status: () => status,
    ok: () => status >= 200 && status < 300,
    url: () => "http://localhost/account-setup",
    headers: () => (redirect ? { "x-action-redirect": redirect } : {}),
  });
  it("keeps rejecting unexpected redirects by default", async () => {
    const page = {
      waitForResponse: vi.fn<Page["waitForResponse"]>().mockResolvedValue(responseWithStatus(303) as Response),
    };
    await expect(
      waitForServerActionResponse(page as unknown as Page, { pathIncludes: "/account-setup" })
    ).rejects.toThrow("status 303");
  });
  it("accepts an explicitly expected redirect after a committed action", async () => {
    const response = responseWithStatus(303);
    const page = { waitForResponse: vi.fn<Page["waitForResponse"]>().mockResolvedValue(response as Response) };
    await expect(
      waitForServerActionResponse(page as unknown as Page, { pathIncludes: "/account-setup", expectedStatus: 303 })
    ).resolves.toBe(response);
    const predicate = page.waitForResponse.mock.calls[0][0];
    if (typeof predicate !== "function") throw new Error("Expected a response predicate.");
    expect(
      predicate({ request: () => ({ method: () => "GET" }), url: () => "http://localhost/account-setup" } as Response)
    ).toBe(false);
    expect(
      predicate({ request: () => ({ method: () => "POST" }), url: () => "http://localhost/account-setup" } as Response)
    ).toBe(true);
  });
  it("rejects failures even when a redirect is expected", async () => {
    const page = {
      waitForResponse: vi.fn<Page["waitForResponse"]>().mockResolvedValue(responseWithStatus(500) as Response),
    };
    await expect(
      waitForServerActionResponse(page as unknown as Page, { pathIncludes: "/account-setup", expectedStatus: 303 })
    ).rejects.toThrow("status 500");
  });
  it("accepts a successful fetch-action redirect when a 303 is expected", async () => {
    const response = responseWithStatus(200, "/trips;push");
    const page = { waitForResponse: vi.fn<Page["waitForResponse"]>().mockResolvedValue(response as Response) };
    await expect(
      waitForServerActionResponse(page as unknown as Page, { pathIncludes: "/account-setup", expectedStatus: 303 })
    ).resolves.toBe(response);
  });
  it("rejects an ordinary 200 when a redirect is expected", async () => {
    const page = {
      waitForResponse: vi.fn<Page["waitForResponse"]>().mockResolvedValue(responseWithStatus(200) as Response),
    };
    await expect(
      waitForServerActionResponse(page as unknown as Page, { pathIncludes: "/account-setup", expectedStatus: 303 })
    ).rejects.toThrow("status 200");
  });
  it("rejects a failed response even when it carries a redirect header", async () => {
    const page = {
      waitForResponse: vi
        .fn<Page["waitForResponse"]>()
        .mockResolvedValue(responseWithStatus(500, "/trips;push") as Response),
    };
    await expect(
      waitForServerActionResponse(page as unknown as Page, { pathIncludes: "/account-setup", expectedStatus: 303 })
    ).rejects.toThrow("status 500");
  });
});
