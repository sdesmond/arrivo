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
      searchParams: Promise.resolve({ new: "1" }),
    });

    render(page);

    expect(screen.getByText("Trip detail client")).toBeInTheDocument();
    expect(tripDetailClientSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: baseDetail,
        dateFormat: "DD/MM/YYYY",
        initialExpandedDayNumber: 1,
        isNew: true,
        templates: [],
      })
    );
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
