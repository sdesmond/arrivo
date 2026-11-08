import { expect, it } from "vitest";
import { z } from "zod";
import { defineEndpoint } from "./endpoint";
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
