import { expect, it } from "vitest";
import { API_META } from "./meta";

it("exposes only the API version and capabilities", () => {
  expect(API_META).toEqual({ apiVersion: 1, capabilities: ["idempotency-key"] });
  expect(Object.keys(API_META)).toEqual(["apiVersion", "capabilities"]);
});
