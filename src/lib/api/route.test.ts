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
import { defineEndpoint, MULTIPART_OVERHEAD_BYTES } from "./endpoint";
import nextConfig from "../../../next.config";
import { MAX_UPLOAD_BYTES } from "@/lib/utils";
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
it("returns declared 204 without content and forwards keyed replay context", async () => {
  const remove = vi.fn(async () => null);
  const empty = apiRoute({ ...endpoint, status: 204 }, remove, { idempotent: {} });
  const response = await empty(request(undefined, { "idempotency-key": "delete-retry" }), context);
  expect(response.status).toBe(204);
  expect(await response.text()).toBe("");
  expect(response.headers.get("content-type")).toBeNull();
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(remove).toHaveBeenCalledWith(
    expect.objectContaining({ replay: expect.objectContaining({ key: "delete-retry" }) })
  );
});
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

const uploadEndpoint = defineEndpoint<{ stored: boolean }>()({
  method: "POST",
  path: "/api/v1/items/:id/files",
  params: z.object({ id: z.uuid() }),
  body: z.strictObject({ id: z.uuid().optional() }),
  multipart: { maxFileBytes: 1024 },
});
const uploadHandler = vi.fn<(input: unknown) => Promise<{ stored: boolean }>>(async () => ({ stored: true }));
const uploadRoute = apiRoute(uploadEndpoint, uploadHandler);
const fileId = "123e4567-e89b-12d3-a456-426614174001";
function multipartRequest(
  build: (form: FormData) => void = (form) => form.append("file", new File(["%PDF-1.4"], "a.pdf")),
  headers: Record<string, string> = {}
) {
  const form = new FormData();
  build(form);
  return new Request("http://arrivo.test/api/v1/items/item/files", {
    method: "POST",
    headers: { "x-arrivo-client": "web", "sec-fetch-site": "same-origin", ...headers },
    body: form,
  });
}
it("parses one file part and named fields for a multipart endpoint", async () => {
  const response = await uploadRoute(
    multipartRequest((form) => {
      form.append("id", fileId);
      form.append("file", new File(["%PDF-1.4"], "a.pdf", { type: "application/pdf" }));
    }),
    context
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ stored: true });
  const input = uploadHandler.mock.calls[0][0] as { body: unknown; file: File };
  expect(input.body).toEqual({ id: fileId });
  expect(input.file.name).toBe("a.pdf");
  expect(input.file.type).toBe("application/pdf");
  expect(assertWithinRateLimit).toHaveBeenCalledWith("api", "user");
});
it("keeps CSRF, auth and the key rule ahead of the multipart body", async () => {
  expect((await uploadRoute(multipartRequest(undefined, { "sec-fetch-site": "same-site" }), context)).status).toBe(403);
  expect((await uploadRoute(multipartRequest(undefined, { "x-arrivo-client": "" }), context)).status).toBe(403);
  requireApiUser.mockRejectedValueOnce(new ApiError(401, "unauthenticated", "Sign in."));
  expect((await uploadRoute(multipartRequest(), context)).status).toBe(401);
  const keyed = await uploadRoute(multipartRequest(undefined, { "idempotency-key": "k" }), context);
  expect(keyed.status).toBe(400);
  expect(uploadHandler).not.toHaveBeenCalled();
});
it("answers 413 from Content-Length before reading the body", async () => {
  const response = await uploadRoute(
    multipartRequest(undefined, { "content-length": String(1024 + MULTIPART_OVERHEAD_BYTES + 1) }),
    context
  );
  expect(response.status).toBe(413);
  expect((await response.json()).error.code).toBe("payload_too_large");
  expect(uploadHandler).not.toHaveBeenCalled();
});
it("passes a body whose Content-Length is within the limit to the handler", async () => {
  const response = await uploadRoute(multipartRequest(undefined, { "content-length": "100" }), context);
  expect(response.status).toBe(200);
});
it("rejects a body that is not valid multipart with 400", async () => {
  const request = new Request("http://arrivo.test/api/v1/items/item/files", {
    method: "POST",
    headers: {
      "x-arrivo-client": "web",
      "sec-fetch-site": "same-origin",
      "content-type": "multipart/form-data; boundary=x",
    },
    body: "not multipart",
  });
  const response = await uploadRoute(request, context);
  expect(response.status).toBe(400);
  expect((await response.json()).error.code).toBe("bad_request");
});
it.each([
  [
    "a second file part",
    (form: FormData) => {
      form.append("file", new File(["a"], "a"));
      form.append("file", new File(["b"], "b"));
    },
  ],
  [
    "a file under another name",
    (form: FormData) => {
      form.append("other", new File(["a"], "a"));
    },
  ],
  [
    "a repeated field",
    (form: FormData) => {
      form.append("file", new File(["a"], "a"));
      form.append("id", fileId);
      form.append("id", fileId);
    },
  ],
  [
    "text in the file field",
    (form: FormData) => {
      form.append("file", "text");
    },
  ],
])("rejects %s with 400", async (_label, build) => {
  const response = await uploadRoute(multipartRequest(build), context);
  expect(response.status).toBe(400);
  expect(uploadHandler).not.toHaveBeenCalled();
});
it("returns 422 for a missing file, an unknown field or a bad field value", async () => {
  const missing = await uploadRoute(
    multipartRequest((form) => form.append("id", fileId)),
    context
  );
  expect(missing.status).toBe(422);
  expect((await missing.json()).error.fields.file).toBeDefined();
  const unknown = await uploadRoute(
    multipartRequest((form) => {
      form.append("file", new File(["a"], "a"));
      form.append("extra", "1");
    }),
    context
  );
  expect(unknown.status).toBe(422);
  const badId = await uploadRoute(
    multipartRequest((form) => {
      form.append("file", new File(["a"], "a"));
      form.append("id", "nope");
    }),
    context
  );
  expect(badId.status).toBe(422);
  expect((await uploadRoute(multipartRequest(), { params: Promise.resolve({ id: "bad" }) })).status).toBe(422);
  expect(uploadHandler).not.toHaveBeenCalled();
});
it("rejects a JSON body sent to a multipart endpoint", async () => {
  const response = await uploadRoute(request("{}"), context);
  expect(response.status).toBe(400);
  expect(uploadHandler).not.toHaveBeenCalled();
});
it("does not accept a multipart body on a JSON endpoint", async () => {
  const response = await route(multipartRequest(), context);
  expect(response.status).toBe(400);
  expect(handler).not.toHaveBeenCalled();
});
it("raises the proxy body buffer above the 25 MB document limit plus form overhead", () => {
  const raw = nextConfig.experimental?.proxyClientMaxBodySize;
  const bytes = typeof raw === "number" ? raw : Number.parseInt(String(raw), 10) * 1024 * 1024;
  expect(bytes).toBeGreaterThanOrEqual(MAX_UPLOAD_BYTES + MULTIPART_OVERHEAD_BYTES);
});

const getEndpoint = defineEndpoint<{ done: boolean }>()({
  method: "GET",
  path: "/search",
  params: z.object({}),
  body: z.strictObject({ query: z.string().min(1), page: z.coerce.number().int().min(1).optional() }),
});
const getRoute = apiRoute(getEndpoint, handler);
function getRequest(query = "query=Paris&page=2", headers: Record<string, string> = {}) {
  return new Request("http://arrivo.test/search?" + query, {
    headers: { "x-arrivo-client": "web", "sec-fetch-site": "same-origin", ...headers },
  });
}
it("validates GET queries without reading JSON", async () => {
  expect((await getRoute(getRequest(), context)).status).toBe(200);
  expect(handler).toHaveBeenCalledWith({ actor: { userId: "user" }, params: {}, body: { query: "Paris", page: 2 } });
});
it("rejects repeated GET keys and invalid queries", async () => {
  expect((await getRoute(getRequest("query=Paris&query=Rome"), context)).status).toBe(400);
  expect((await getRoute(getRequest("query=Paris", { "idempotency-key": "key" }), context)).status).toBe(400);
  for (const query of ["query=", "query=Paris&page=0", "query=Paris&extra=x"])
    expect((await getRoute(getRequest(query), context)).status).toBe(422);
  expect(handler).not.toHaveBeenCalled();
});
it("authenticates and guards GET before spending budget", async () => {
  requireApiUser.mockRejectedValueOnce(new ApiError(401, "unauthenticated", "Sign in."));
  expect((await getRoute(getRequest(), context)).status).toBe(401);
  expect((await getRoute(getRequest(undefined, { "x-arrivo-client": "" }), context)).status).toBe(403);
  expect(assertWithinRateLimit).not.toHaveBeenCalled();
});

it("accepts static GET routes whose Next context has no params", async () => {
  const staticContext = {} as { params: Promise<Record<string, string>> };
  expect((await getRoute(getRequest(), staticContext)).status).toBe(200);
  expect(handler).toHaveBeenCalledWith({ actor: { userId: "user" }, params: {}, body: { query: "Paris", page: 2 } });
});
