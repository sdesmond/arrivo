import { expect, it } from "vitest";
import { z } from "zod";
import { defineEndpoint } from "./endpoint";
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
