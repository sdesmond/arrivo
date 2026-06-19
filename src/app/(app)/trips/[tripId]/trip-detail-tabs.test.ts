import { describe, expect, it } from "vitest";
import { buildReservationsDeepLinkHref, buildTripDetailTabHref, resolveTripDetailTab } from "./trip-detail-tabs";

describe("resolveTripDetailTab", () => {
  it("defaults to itin for unrecognized or missing values", () => {
    expect(resolveTripDetailTab(undefined)).toBe("itin");
    expect(resolveTripDetailTab(null)).toBe("itin");
    expect(resolveTripDetailTab("bogus")).toBe("itin");
  });

  it("resolves recognized tab values", () => {
    expect(resolveTripDetailTab("res")).toBe("res");
    expect(resolveTripDetailTab("docs")).toBe("docs");
  });
});

describe("buildTripDetailTabHref", () => {
  it("removes the tab param for itinerary", () => {
    expect(buildTripDetailTabHref("/trips/trip-1", new URLSearchParams("tab=res"), "itin")).toBe("/trips/trip-1");
  });

  it("sets the tab param for non-itinerary tabs while preserving others", () => {
    expect(buildTripDetailTabHref("/trips/trip-1", new URLSearchParams("focus=event-1"), "docs")).toBe(
      "/trips/trip-1?focus=event-1&tab=docs"
    );
  });
});

describe("buildReservationsDeepLinkHref", () => {
  it("sets tab=res and action=add-reservation, removing highlight and focus, while preserving unrelated params", () => {
    const href = buildReservationsDeepLinkHref(
      "/trips/trip-1",
      new URLSearchParams("focus=event-1&new=1&highlight=res-2"),
      { kind: "add-reservation" }
    );

    expect(href).toBe("/trips/trip-1?new=1&tab=res&action=add-reservation");
  });

  it("sets tab=res and highlight, removing action and focus, while preserving unrelated params", () => {
    const href = buildReservationsDeepLinkHref(
      "/trips/trip-1",
      new URLSearchParams("focus=event-1&new=1&action=add-reservation"),
      { kind: "highlight", reservationId: "res-9" }
    );

    expect(href).toBe("/trips/trip-1?new=1&tab=res&highlight=res-9");
  });

  it("returns a bare pathname-free query when there are no params left to add besides the required ones", () => {
    const href = buildReservationsDeepLinkHref("/trips/trip-1", new URLSearchParams(), {
      kind: "highlight",
      reservationId: "res-1",
    });

    expect(href).toBe("/trips/trip-1?tab=res&highlight=res-1");
  });
});
