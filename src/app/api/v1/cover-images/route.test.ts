// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ service: vi.fn(), auth: vi.fn(), limit: vi.fn() }));
vi.mock("@/lib/services/cover-search", () => ({ searchCoverImages: mocks.service }));
vi.mock("@/lib/api/auth", () => ({ requireApiUser: mocks.auth }));
vi.mock("@/lib/rate-limit", async (original) => ({
  ...(await original<typeof import("@/lib/rate-limit")>()),
  assertWithinRateLimit: mocks.limit,
}));
import { GET } from "./route";
import { ApiError } from "@/lib/api/errors";
import { RateLimitError } from "@/lib/rate-limit";
const context = { params: Promise.resolve({}) };
function request(query = "query=Paris&page=2", headers: Record<string, string> = {}) {
  return new Request("http://arrivo.test/api/v1/cover-images?" + query, {
    headers: { "x-arrivo-client": "web", "sec-fetch-site": "same-origin", ...headers },
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ userId: "user" });
  mocks.service.mockResolvedValue([]);
});
it("returns no-store result and passes actor and validated query", async () => {
  const response = await GET(request(), context);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ images: [] });
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(mocks.service).toHaveBeenCalledWith({ userId: "user" }, "Paris", { query: "Paris", page: 2 });
});
it("rejects unauthenticated, cross-origin, malformed and keyed reads before search", async () => {
  mocks.auth.mockRejectedValueOnce(new ApiError(401, "unauthenticated", "Sign in."));
  expect((await GET(request(), context)).status).toBe(401);
  expect((await GET(request(undefined, { "x-arrivo-client": "" }), context)).status).toBe(403);
  expect((await GET(request(undefined, { "sec-fetch-site": "cross-site" }), context)).status).toBe(403);
  expect(mocks.limit).not.toHaveBeenCalled();
  expect((await GET(request("query="), context)).status).toBe(422);
  expect((await GET(request("query=Paris&page=2&extra=x"), context)).status).toBe(422);
  expect((await GET(request("query=Paris&page=2&query=Rome"), context)).status).toBe(400);
  expect((await GET(request(undefined, { "idempotency-key": "key" }), context)).status).toBe(400);
  expect(mocks.service).not.toHaveBeenCalled();
});
it("maps upstream budget errors with Retry-After and hides unexpected failures", async () => {
  mocks.service.mockRejectedValueOnce(new RateLimitError(8));
  const limited = await GET(request(), context);
  expect(limited.status).toBe(429);
  expect(limited.headers.get("retry-after")).toBe("8");
  mocks.service.mockRejectedValueOnce(new Error("secret"));
  const failure = await GET(request(), context);
  expect(failure.status).toBe(500);
  expect((await failure.json()).error.code).toBe("server_error");
});
