// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";
const { requireApiUser, assertWithinRateLimit } = vi.hoisted(() => ({
  requireApiUser: vi.fn(),
  assertWithinRateLimit: vi.fn(),
}));
vi.mock("./auth", () => ({ requireApiUser }));
vi.mock("@/lib/rate-limit", async (original) => ({
  ...(await original<typeof import("@/lib/rate-limit")>()),
  assertWithinRateLimit,
}));
import { apiRoute } from "./route";
import { defineEndpoint } from "./endpoint";
import { ApiError } from "./errors";
import { RateLimitError } from "@/lib/rate-limit";
const endpoint = defineEndpoint<{ done: boolean }>()({
  method: "PATCH",
  path: "/api/v1/items/:id",
  params: z.object({ id: z.uuid() }),
  body: z.strictObject({ isChecked: z.boolean() }),
});
const handler = vi.fn<(input: unknown) => Promise<{ done: boolean }>>(async () => ({ done: true }));
const route = apiRoute(endpoint, handler);
const replayRoute = apiRoute(endpoint, handler, { idempotent: { expiryMs: 5000 } });
const context = { params: Promise.resolve({ id: "123e4567-e89b-12d3-a456-426614174000" }) };
function request(body = '{"isChecked":true}', headers: Record<string, string> = {}) {
  return new Request("http://arrivo.test/api/v1/items/item", {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "x-arrivo-client": "web",
      "sec-fetch-site": "same-origin",
      ...headers,
    },
    body,
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  requireApiUser.mockResolvedValue({ userId: "user" });
});
it("authenticates, validates, budgets, and returns no-store data", async () => {
  const response = await route(request(), context);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ done: true });
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(handler).toHaveBeenCalledWith({
    actor: { userId: "user" },
    params: await context.params,
    body: { isChecked: true },
  });
  expect(assertWithinRateLimit).toHaveBeenCalledWith("api", "user");
});
it.each(["oops", "null", "[]", "true"])("returns 400 for malformed/nonobject body %s", async (body) => {
  expect((await route(request(body), context)).status).toBe(400);
  expect(handler).not.toHaveBeenCalled();
});
it("returns 422 for field and param failures", async () => {
  expect((await route(request('{"isChecked":"true"}'), context)).status).toBe(422);
  expect((await route(request(), { params: Promise.resolve({ id: "bad" }) })).status).toBe(422);
  expect(handler).not.toHaveBeenCalled();
});
it("rejects CSRF before writes and sends no CORS", async () => {
  const response = await route(request(undefined, { "sec-fetch-site": "same-site" }), context);
  expect(response.status).toBe(403);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("access-control-allow-origin")).toBeNull();
  expect(handler).not.toHaveBeenCalled();
});
it("maps auth, limit and unexpected failures", async () => {
  requireApiUser.mockRejectedValueOnce(new ApiError(401, "unauthenticated", "Sign in."));
  expect((await route(request(), context)).status).toBe(401);
  assertWithinRateLimit.mockImplementationOnce(() => {
    throw new RateLimitError(4);
  });
  const limited = await route(request(), context);
  expect(limited.status).toBe(429);
  expect(limited.headers.get("retry-after")).toBe("4");
  handler.mockRejectedValueOnce(new Error("secret"));
  expect((await route(request(), context)).status).toBe(500);
});

it.each([
  [401, "unauthenticated"],
  [403, "mfa_enrollment_required"],
] as const)("keeps auth %s %s JSON and no-store", async (status, code) => {
  requireApiUser.mockRejectedValueOnce(new ApiError(status, code, "Authenticate."));
  const response = await route(request(), context);
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect((await response.json()).error.code).toBe(code);
  expect(handler).not.toHaveBeenCalled();
});

it("forwards no replay context when the key header is absent", async () => {
  await replayRoute(request(), context);
  expect(handler.mock.calls[0][0]).not.toHaveProperty("replay");
});
it("forwards validated replay metadata when the key header is present", async () => {
  const response = await replayRoute(request(undefined, { "idempotency-key": " retry-1 " }), context);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(handler).toHaveBeenCalledWith({
    actor: { userId: "user" },
    params: await context.params,
    body: { isChecked: true },
    replay: {
      key: "retry-1",
      method: "PATCH",
      path: "/api/v1/items/123e4567-e89b-12d3-a456-426614174000",
      expiryMs: 5000,
    },
  });
});
it("omits expiry from replay metadata unless configured", async () => {
  await apiRoute(endpoint, handler, { idempotent: {} })(request(undefined, { "idempotency-key": "k" }), context);
  expect(handler.mock.calls[0][0]).toMatchObject({ replay: { key: "k" } });
  expect((handler.mock.calls[0][0] as { replay: object }).replay).not.toHaveProperty("expiryMs");
});
it.each(["", "   ", "a".repeat(256)])(
  "rejects invalid key %j with a 422 field error before the handler",
  async (key) => {
    const response = await replayRoute(request(undefined, { "idempotency-key": key }), context);
    expect(response.status).toBe(422);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).error.fields["Idempotency-Key"]).toHaveLength(1);
    expect(handler).not.toHaveBeenCalled();
  }
);
it("explicitly rejects a key on a handler that does not support replay", async () => {
  const response = await route(request(undefined, { "idempotency-key": "retry-1" }), context);
  expect(response.status).toBe(400);
  expect((await response.json()).error.code).toBe("bad_request");
  expect(handler).not.toHaveBeenCalled();
});
it("still enforces auth, CSRF and validation before honoring a key", async () => {
  const keyed = { "idempotency-key": "retry-1" };
  requireApiUser.mockRejectedValueOnce(new ApiError(401, "unauthenticated", "Sign in."));
  expect((await replayRoute(request(undefined, keyed), context)).status).toBe(401);
  expect((await replayRoute(request(undefined, { ...keyed, "sec-fetch-site": "same-site" }), context)).status).toBe(
    403
  );
  expect((await replayRoute(request('{"isChecked":"no"}', keyed), context)).status).toBe(422);
  expect(handler).not.toHaveBeenCalled();
});
it("rejects an unsupported key before body or param validation", async () => {
  const keyed = { "idempotency-key": "retry-1" };
  for (const response of [
    await route(request('{"isChecked":"no"}', keyed), context),
    await route(request("oops", keyed), context),
    await route(request(undefined, keyed), { params: Promise.resolve({ id: "bad" }) }),
  ]) {
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("bad_request");
  }
  expect(handler).not.toHaveBeenCalled();
});
