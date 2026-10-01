import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { TripDetailPayload } from "@/data/types";

const {
  mockHeaders,
  mockGetServerNow,
  mockGetTripDetail,
  mockGetUserById,
  mockListTemplatesForUser,
  mockNotFound,
  mockRequireUser,
  tripDetailClientSpy,
} = vi.hoisted(() => ({
  mockHeaders: vi.fn(),
  mockGetServerNow: vi.fn(),
  mockGetTripDetail: vi.fn(),
  mockGetUserById: vi.fn(),
  mockListTemplatesForUser: vi.fn(),
  mockNotFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  mockRequireUser: vi.fn(),
  tripDetailClientSpy: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: mockNotFound,
}));

vi.mock("next/headers", () => ({
  headers: mockHeaders,
}));

vi.mock("@/lib/auth-helpers", () => ({
  requireUser: mockRequireUser,
}));

vi.mock("@/lib/queries", () => ({
  getTripDetail: mockGetTripDetail,
  getUserById: mockGetUserById,
  listTemplatesForUser: mockListTemplatesForUser,
}));

vi.mock("@/lib/server-now", () => ({
  getServerNow: mockGetServerNow,
}));

vi.mock("@/lib/utils", () => ({
  detectDefaultDateFormat: vi.fn(() => "MM/DD/YYYY"),
}));

vi.mock("./page-client", () => ({
  TripDetailClient: (props: unknown) => {
    tripDetailClientSpy(props);
    return <div>Trip detail client</div>;
  },
}));

import TripDetailPage from "./page";

const baseDetail: TripDetailPayload = {
  trip: {
    id: "trip-1",
    name: "Tokyo",
    status: "upcoming",
  },
  days: [],
  unscheduledEvents: [],
  docs: [],
  collaborators: [],
  packingItems: [],
  packingLists: [],
  reservations: [],
  expenses: [],
  notes: [],
  accessRole: "manager",
};

describe("TripDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHeaders.mockResolvedValue(new Headers());
    mockRequireUser.mockResolvedValue({ id: "user-1" });
    mockGetTripDetail.mockResolvedValue(baseDetail);
    mockGetUserById.mockResolvedValue({ id: "user-1", email: "user@test.com", dateFormat: "DD/MM/YYYY" });
    mockGetServerNow.mockResolvedValue(new Date("2026-06-05T12:00:00.000Z"));
    mockListTemplatesForUser.mockResolvedValue([]);
  });

  it("renders the trip detail client when the trip exists", async () => {
    const page = await TripDetailPage({
      params: Promise.resolve({ tripId: "trip-1" }),
      searchParams: Promise.resolve({ new: "1", tab: "docs" }),
    });

    render(page);

    expect(screen.getByText("Trip detail client")).toBeInTheDocument();
    expect(tripDetailClientSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: baseDetail,
        dateFormat: "DD/MM/YYYY",
        initialExpandedDayNumber: 1,
        initialActiveTab: "docs",
        isNew: true,
        templates: [],
      })
    );
  });

  it("expands the day containing a focused event", async () => {
    const detailWithDays: TripDetailPayload = {
      ...baseDetail,
      days: [
        {
          id: "day-1",
          dayNumber: 1,
          date: "2026-06-05",
          label: "Day 1",
          events: [{ id: "event-1", name: "Breakfast", position: 0 }],
        },
        {
          id: "day-2",
          dayNumber: 2,
          date: "2026-06-06",
          label: "Day 2",
          events: [{ id: "event-2", name: "Temple Tour", position: 0 }],
        },
      ],
    };
    mockGetTripDetail.mockResolvedValue(detailWithDays);

    const page = await TripDetailPage({
      params: Promise.resolve({ tripId: "trip-1" }),
      searchParams: Promise.resolve({ focus: "event-2" }),
    });

    render(page);

    expect(tripDetailClientSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: detailWithDays,
        initialExpandedDayNumber: 2,
      })
    );
  });

  it("passes the profile's walkThresholdMeters through to the trip detail client", async () => {
    mockGetUserById.mockResolvedValue({
      id: "user-1",
      email: "user@test.com",
      dateFormat: "DD/MM/YYYY",
      walkThresholdMeters: 400,
    });

    const page = await TripDetailPage({
      params: Promise.resolve({ tripId: "trip-1" }),
      searchParams: Promise.resolve({}),
    });

    render(page);

    expect(tripDetailClientSpy).toHaveBeenCalledWith(expect.objectContaining({ walkThresholdMeters: 400 }));
  });

  it("passes undefined walkThresholdMeters through when the profile has no threshold set", async () => {
    const page = await TripDetailPage({
      params: Promise.resolve({ tripId: "trip-1" }),
      searchParams: Promise.resolve({}),
    });

    render(page);

    expect(tripDetailClientSpy).toHaveBeenCalledWith(expect.objectContaining({ walkThresholdMeters: undefined }));
  });

  it("falls back to the itinerary tab when the tab query is invalid", async () => {
    const page = await TripDetailPage({
      params: Promise.resolve({ tripId: "trip-1" }),
      searchParams: Promise.resolve({ tab: "invalid-tab" }),
    });

    render(page);

    expect(screen.getByText("Trip detail client")).toBeInTheDocument();
    expect(tripDetailClientSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        initialActiveTab: "itin",
        initialExpandedDayNumber: undefined,
        isNew: false,
      })
    );
  });

  it("falls back to the itinerary tab when a viewer deep-links to the budget tab", async () => {
    mockGetTripDetail.mockResolvedValue({ ...baseDetail, accessRole: "viewer" });

    const page = await TripDetailPage({
      params: Promise.resolve({ tripId: "trip-1" }),
      searchParams: Promise.resolve({ tab: "budget" }),
    });

    render(page);

    expect(tripDetailClientSpy).toHaveBeenCalledWith(expect.objectContaining({ initialActiveTab: "itin" }));
  });

  it("keeps the budget tab for an editor deep-linking to it", async () => {
    mockGetTripDetail.mockResolvedValue({ ...baseDetail, accessRole: "editor" });

    const page = await TripDetailPage({
      params: Promise.resolve({ tripId: "trip-1" }),
      searchParams: Promise.resolve({ tab: "budget" }),
    });

    render(page);

    expect(tripDetailClientSpy).toHaveBeenCalledWith(expect.objectContaining({ initialActiveTab: "budget" }));
  });

  it("converts missing trips into notFound", async () => {
    mockGetTripDetail.mockResolvedValue(null);

    await expect(
      TripDetailPage({
        params: Promise.resolve({ tripId: "trip-1" }),
        searchParams: Promise.resolve({}),
      })
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(mockNotFound).toHaveBeenCalledTimes(1);
    expect(tripDetailClientSpy).not.toHaveBeenCalled();
  });
});
