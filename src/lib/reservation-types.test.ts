import { expect, it } from "vitest";
import { REQUIRES_END_AT } from "./reservation-types";

it("requires an end for lodging, rental cars and cruises", () => {
  expect(REQUIRES_END_AT).toEqual(["lodging", "rental-car", "cruise"]);
});
