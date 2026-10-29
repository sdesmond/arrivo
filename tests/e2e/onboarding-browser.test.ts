import { isIP } from "node:net";
import { describe, expect, it, vi } from "vitest";
import type { Page } from "@playwright/test";
import { exchangeCredentialLink, onboardingClientHeaders, openCredentialLink } from "./onboarding-browser";

describe("credential browser calls", () => {
  it("uses a valid documentation IPv6 client address", () => {
    const address = onboardingClientHeaders()["x-forwarded-for"];
    expect(address.startsWith("2001:db8::")).toBe(true);
    expect(isIP(address)).toBe(6);
  });

  it("marks real navigation and exchange calls internal", async () => {
    const wrap = vi.fn(async (run: () => Promise<unknown>, options: { internal: true }) => {
      expect(options).toEqual({ internal: true });
      return run();
    });
    const goto = vi.fn().mockResolvedValue(undefined);
    const get = vi.fn().mockResolvedValue({ status: () => 303 });
    const page = { _wrapApiCall: wrap, goto, request: { _wrapApiCall: wrap, get } } as unknown as Page;
    const credentialUrl = "/account-setup/open?token=in-memory-test-value";
    await openCredentialLink(page, credentialUrl);
    const response = await exchangeCredentialLink(page, credentialUrl);
    expect(response.status()).toBe(303);
    expect(goto).toHaveBeenCalledWith(credentialUrl);
    expect(get).toHaveBeenCalledWith(credentialUrl, { maxRedirects: 0 });
    expect(wrap).toHaveBeenCalledTimes(2);
    for (const call of wrap.mock.calls) expect(call[1]).toEqual({ internal: true });
  });

  it("throws safe navigation and exchange errors", async () => {
    const wrap = async () => {
      throw new Error("sensitive underlying error");
    };
    const page = { _wrapApiCall: wrap, request: { _wrapApiCall: wrap } } as unknown as Page;
    await expect(openCredentialLink(page, "sensitive")).rejects.toThrow(/^Credential navigation failed\.$/);
    await expect(exchangeCredentialLink(page, "sensitive")).rejects.toThrow(/^Credential exchange request failed\.$/);
  });
});
