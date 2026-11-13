import { expect, it } from "vitest";
import { searchCoverImages, resolveDestinationCenter } from "./cover-images";
import { FIELD_LIMITS, MAX_COVER_SEARCH_PAGE } from "@/lib/validation-limits";
it("accepts bounded query strings and coerces pagination", () => {
  expect(searchCoverImages.body.parse({ query: " Paris ", page: "2", perPage: "30" })).toEqual({
    query: "Paris",
    page: 2,
    perPage: 30,
  });
  expect(resolveDestinationCenter.body.parse({ name: "Paris" })).toEqual({ name: "Paris" });
});
it.each([
  { query: "" },
  { query: "x".repeat(FIELD_LIMITS.destination + 1) },
  { query: "Paris", page: 0 },
  { query: "Paris", page: MAX_COVER_SEARCH_PAGE + 1 },
  { query: "Paris", perPage: 31 },
  { query: "Paris", extra: "x" },
])("rejects invalid search %j", (body) => {
  expect(searchCoverImages.body.safeParse(body).success).toBe(false);
});
it.each([{ name: "" }, { name: "x".repeat(FIELD_LIMITS.destination + 1) }, { name: "Paris", extra: "x" }])(
  "rejects invalid destination %j",
  (body) => {
    expect(resolveDestinationCenter.body.safeParse(body).success).toBe(false);
  }
);
