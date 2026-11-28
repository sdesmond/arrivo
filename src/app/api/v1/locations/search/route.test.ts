// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ destination: vi.fn(), address: vi.fn(), auth: vi.fn(), limit: vi.fn() }));
vi.mock("@/lib/services/locations", () => ({
  searchDestinationLocations: mocks.destination,
  searchAddressLocations: mocks.address,
}));
vi.mock("@/lib/api/auth", () => ({ requireApiUser: mocks.auth }));
vi.mock("@/lib/rate-limit", async (original) => ({
  ...(await original<typeof import("@/lib/rate-limit")>()),
  assertWithinRateLimit: mocks.limit,
}));
import { GET } from "./route";
import { ApiError } from "@/lib/api/errors";
import { RateLimitError } from "@/lib/rate-limit";
import { ValidationFailedError } from "@/lib/services/validation-failed-error";
const context = { params: Promise.resolve({}) };
const valid = "query=Paris&mode=destination&sessionToken=session";
function request(query = valid, headers: Record<string, string> = {}) {
  return new Request("http://arrivo.test/api/v1/locations/search?" + query, {
    headers: { "x-arrivo-client": "web", "sec-fetch-site": "same-origin", ...headers },
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ userId: "user" });
  mocks.destination.mockResolvedValue([{ placeName: "Paris, France" }]);
  mocks.address.mockResolvedValue([{ name: "Paris" }]);
});
it.each([
  ["destination", mocks.destination, mocks.address, { placeName: "Paris, France" }],
  ["address", mocks.address, mocks.destination, { name: "Paris" }],
])("returns no-store %s suggestions from the matching service", async (mode, called, skipped, suggestion) => {
  const response = await GET(request(`query=%20Paris%20&mode=${mode}&sessionToken=session`), context);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ suggestions: [suggestion] });
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(called).toHaveBeenCalledWith({ userId: "user" }, "Paris", "session");
  expect(skipped).not.toHaveBeenCalled();
});
it("rejects unauthenticated, cross-origin, malformed and keyed reads before search", async () => {
  mocks.auth.mockRejectedValueOnce(new ApiError(401, "unauthenticated", "Sign in."));
  expect((await GET(request(), context)).status).toBe(401);
  expect((await GET(request(valid, { "x-arrivo-client": "" }), context)).status).toBe(403);
  expect((await GET(request(valid, { "sec-fetch-site": "cross-site" }), context)).status).toBe(403);
  for (const query of [
    "mode=destination&sessionToken=session",
    "query=%20&mode=destination&sessionToken=session",
    "query=Paris&mode=location&sessionToken=session",
    `query=${"q".repeat(257)}&mode=address&sessionToken=session`,
    "query=Paris&mode=address",
    valid + "&extra=x",
  ]) {
    const response = await GET(request(query), context);
    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe("validation_failed");
  }
  expect((await GET(request(valid + "&query=Rome"), context)).status).toBe(400);
  expect((await GET(request(valid, { "idempotency-key": "key" }), context)).status).toBe(400);
  expect(mocks.destination).not.toHaveBeenCalled();
  expect(mocks.address).not.toHaveBeenCalled();
});
it("maps service validation and budget errors and hides provider failures", async () => {
  mocks.destination.mockRejectedValueOnce(new ValidationFailedError("Search query must not be empty"));
  expect((await GET(request(), context)).status).toBe(422);
  mocks.destination.mockRejectedValueOnce(new RateLimitError(8));
  const limited = await GET(request(), context);
  expect(limited.status).toBe(429);
  expect(limited.headers.get("retry-after")).toBe("8");
  const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.destination.mockRejectedValueOnce(new Error("Location search failed: secret"));
  const failure = await GET(request(), context);
  expect(failure.status).toBe(500);
  expect(await failure.json()).toEqual({
    error: { code: "server_error", message: "Something went wrong. Try again." },
  });
  log.mockRestore();
});
