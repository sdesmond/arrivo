import { expect, it } from "vitest";
import { z } from "zod";
import { defineEndpoint, MULTIPART_OVERHEAD_BYTES } from "./endpoint";
it("declares a multipart endpoint with its file limit", () => {
  const endpoint = defineEndpoint<string>()({
    method: "POST",
    path: "/api/v1/files",
    params: z.object({}),
    body: z.object({}),
    multipart: { maxFileBytes: 1024 },
  });
  expect(endpoint.multipart).toEqual({ maxFileBytes: 1024 });
  expect(MULTIPART_OVERHEAD_BYTES).toBeGreaterThan(0);
});
it("declares an empty success response independently of its serializable result", () => {
  const endpoint = defineEndpoint<null>()({
    method: "DELETE",
    path: "/items",
    params: z.object({}),
    body: z.object({}),
    status: 204,
  });
  expect(endpoint.status).toBe(204);
});
it("preserves typed contract metadata", () => {
  const endpoint = defineEndpoint<string>()({
    method: "PATCH",
    path: "/api/v1/items/:id",
    params: z.object({ id: z.string() }),
    body: z.object({ checked: z.boolean() }),
  });
  expect(endpoint.method).toBe("PATCH");
  expect(endpoint.params.parse({ id: "item" })).toEqual({ id: "item" });
});

it("declares GET queries through body", () => {
  const endpoint = defineEndpoint<string>()({
    method: "GET",
    path: "/search",
    params: z.object({}),
    body: z.object({ query: z.string() }),
  });
  expect(endpoint.body.parse({ query: "Paris" })).toEqual({ query: "Paris" });
});
