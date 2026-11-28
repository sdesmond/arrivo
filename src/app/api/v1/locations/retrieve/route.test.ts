// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ service: vi.fn(), auth: vi.fn(), limit: vi.fn() }));
vi.mock("@/lib/services/locations", () => ({ retrieveLocation: mocks.service }));
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
const valid = "mapboxId=mapbox-id&sessionToken=session";
const location = { placeName: "Paris, France", center: [2, 48] };
function request(query = valid, headers: Record<string, string> = {}) {
  return new Request("http://arrivo.test/api/v1/locations/retrieve?" + query, {
    headers: { "x-arrivo-client": "web", "sec-fetch-site": "same-origin", ...headers },
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ userId: "user" });
  mocks.service.mockResolvedValue(location);
});
it("returns the no-store location and passes actor and validated query", async () => {
  const response = await GET(request(), context);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ location });
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(mocks.service).toHaveBeenCalledWith({ userId: "user" }, "mapbox-id", "session");
});
it("rejects unauthenticated, cross-origin, malformed and keyed reads before retrieve", async () => {
  mocks.auth.mockRejectedValueOnce(new ApiError(401, "unauthenticated", "Sign in."));
  expect((await GET(request(), context)).status).toBe(401);
  expect((await GET(request(valid, { "x-arrivo-client": "" }), context)).status).toBe(403);
  expect((await GET(request(valid, { "sec-fetch-site": "cross-site" }), context)).status).toBe(403);
  for (const query of [
    "sessionToken=session",
    "mapboxId=%20&sessionToken=session",
    `mapboxId=${"m".repeat(2049)}&sessionToken=session`,
    "mapboxId=mapbox-id",
    valid + "&extra=x",
  ]) {
    const response = await GET(request(query), context);
    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe("validation_failed");
  }
  expect((await GET(request(valid + "&mapboxId=other"), context)).status).toBe(400);
  expect((await GET(request(valid, { "idempotency-key": "key" }), context)).status).toBe(400);
  expect(mocks.service).not.toHaveBeenCalled();
});
it("maps service validation and budget errors and hides provider failures", async () => {
  mocks.service.mockRejectedValueOnce(new ValidationFailedError("mapboxId is required"));
  expect((await GET(request(), context)).status).toBe(422);
  mocks.service.mockRejectedValueOnce(new RateLimitError(8));
  const limited = await GET(request(), context);
  expect(limited.status).toBe(429);
  expect(limited.headers.get("retry-after")).toBe("8");
  const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.service.mockRejectedValueOnce(new Error("Location retrieve failed: secret"));
  const failure = await GET(request(), context);
  expect(failure.status).toBe(500);
  expect(await failure.json()).toEqual({
    error: { code: "server_error", message: "Something went wrong. Try again." },
  });
  log.mockRestore();
});
