// @vitest-environment node
import { describe, it, expect } from "vitest";
import { ItineraryItemType } from "@/data/types";
import type { RouteResult } from "@/data/types";

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

describe("RouteResult", () => {
  it("accepts a loading state", () => {
    const result: RouteResult = { status: "loading" };
    expect(result.status).toBe("loading");
  });

  it("accepts a ready state with distance and duration", () => {
    const result: RouteResult = { status: "ready", distanceMeters: 500, durationSeconds: 300 };
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.distanceMeters).toBe(500);
      expect(result.durationSeconds).toBe(300);
    }
  });

  it("accepts an unavailable state", () => {
    const result: RouteResult = { status: "unavailable" };
    expect(result.status).toBe("unavailable");
  });
});
