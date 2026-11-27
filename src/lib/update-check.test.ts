// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAvailableUpdate } from "./update-check";

const HOUR_MS = 60 * 60 * 1000;
const fetchMock = vi.fn();

function releaseResponse(tag: unknown): Response {
  return Response.json({ tag_name: tag });
}

function updateFor(version: string) {
  return { version, url: `https://github.com/sdesmond/arrivo/releases/tag/v${version}` };
}

describe("getAvailableUpdate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("APP_VERSION", "0.9.0");
    vi.stubEnv("UPDATE_CHECK", "");
    vi.stubEnv("E2E_UPDATE_STUB", "");
    globalThis.__updateCheck = undefined;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    fetchMock.mockReset();
  });

  it.each(["0.10.0", "0.9.1", "1.0.0"])("reports newer release %s", async (version) => {
    fetchMock.mockResolvedValue(releaseResponse(`v${version}`));
    await expect(getAvailableUpdate()).resolves.toEqual(updateFor(version));
  });

  it.each(["v0.9.0", "v0.8.9", "v0.0.10"])("reports nothing for %s", async (tag) => {
    fetchMock.mockResolvedValue(releaseResponse(tag));
    await expect(getAvailableUpdate()).resolves.toBeNull();
  });

  it.each(["1.0.0", "v1.0", "v1.0.0-rc.1", "nightly", 7, undefined])("ignores the tag %s", async (tag) => {
    fetchMock.mockResolvedValue(releaseResponse(tag));
    await expect(getAvailableUpdate()).resolves.toBeNull();
  });

  it.each(["", "dev"])("reports nothing when the running version is %j", async (version) => {
    vi.stubEnv("APP_VERSION", version);
    fetchMock.mockResolvedValue(releaseResponse("v1.0.0"));
    await expect(getAvailableUpdate()).resolves.toBeNull();
  });

  it("sends only a fixed user agent, with a timeout", async () => {
    fetchMock.mockResolvedValue(releaseResponse("v1.0.0"));
    await getAvailableUpdate();
    expect(fetchMock).toHaveBeenCalledWith("https://api.github.com/repos/sdesmond/arrivo/releases/latest", {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "arrivo-update-check" },
      signal: expect.any(AbortSignal),
      cache: "no-store",
    });
  });

  it.each([
    ["an error status", () => Promise.resolve(new Response("{}", { status: 403 }))],
    ["a rejected request", () => Promise.reject(new DOMException("timed out", "TimeoutError"))],
    ["a body that is not JSON", () => Promise.resolve(new Response("<html>"))],
    ["a null body", () => Promise.resolve(Response.json(null))],
  ])("reports nothing after %s", async (_label, respond) => {
    fetchMock.mockImplementation(respond);
    await expect(getAvailableUpdate()).resolves.toBeNull();
  });

  it("makes no request when the check is disabled, even with a stub", async () => {
    vi.stubEnv("UPDATE_CHECK", "false");
    vi.stubEnv("E2E_UPDATE_STUB", "99.0.0");
    await expect(getAvailableUpdate()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the stub instead of the network", async () => {
    vi.stubEnv("E2E_UPDATE_STUB", "99.0.0");
    await expect(getAvailableUpdate()).resolves.toEqual(updateFor("99.0.0"));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("caches a success for 24 hours", async () => {
    fetchMock.mockImplementation(async () => releaseResponse("v1.0.0"));
    await getAvailableUpdate();
    vi.advanceTimersByTime(24 * HOUR_MS - 1);
    await expect(getAvailableUpdate()).resolves.toEqual(updateFor("1.0.0"));
    expect(fetchMock).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(1);
    await getAvailableUpdate();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries a failure after one hour", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    fetchMock.mockImplementation(async () => releaseResponse("v1.0.0"));
    await getAvailableUpdate();
    vi.advanceTimersByTime(HOUR_MS - 1);
    await expect(getAvailableUpdate()).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(1);
    await expect(getAvailableUpdate()).resolves.toEqual(updateFor("1.0.0"));
  });

  it("shares one in-flight request", async () => {
    fetchMock.mockImplementation(async () => releaseResponse("v1.0.0"));
    const results = await Promise.all([getAvailableUpdate(), getAvailableUpdate()]);
    expect(results).toEqual([updateFor("1.0.0"), updateFor("1.0.0")]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
