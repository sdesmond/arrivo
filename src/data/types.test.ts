// @vitest-environment node
import { describe, it, expect } from "vitest";
import { ItineraryItemType } from "@/data/types";

describe("ItineraryItemType", () => {
  it("exposes Event value", () => {
    expect(ItineraryItemType.Event).toBe("event");
  });

  it("exposes Checklist value", () => {
    expect(ItineraryItemType.Checklist).toBe("checklist");
  });

  it("exposes Note value", () => {
    expect(ItineraryItemType.Note).toBe("note");
  });

  it("has exactly three keys", () => {
    expect(Object.keys(ItineraryItemType)).toHaveLength(3);
  });
});
