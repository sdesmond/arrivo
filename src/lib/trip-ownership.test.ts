import { describe, expect, it } from "vitest";
import { CollaboratorRole, TripDeletionAction } from "@/data/types";
import type { AccountDeletionTrip } from "@/data/types";
import {
  areDeletionChoicesValid,
  buildSharedOwnedTrips,
  orderHeirCandidates,
  type OwnedTripMemberRow,
} from "./trip-ownership";

const DEPARTING_USER = "user-me";

function member(overrides: Partial<OwnedTripMemberRow> & Pick<OwnedTripMemberRow, "id">): OwnedTripMemberRow {
  return {
    tripId: "trip-1",
    userId: `user-${overrides.id}`,
    name: `Name ${overrides.id}`,
    role: CollaboratorRole.Viewer,
    addedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("orderHeirCandidates", () => {
  it("ranks manager above editor above viewer regardless of when they were added", () => {
    const ordered = orderHeirCandidates(
      [
        member({ id: "viewer", role: CollaboratorRole.Viewer, addedAt: new Date("2025-01-01T00:00:00.000Z") }),
        member({ id: "editor", role: CollaboratorRole.Editor, addedAt: new Date("2025-06-01T00:00:00.000Z") }),
        member({ id: "manager", role: CollaboratorRole.Manager, addedAt: new Date("2026-06-01T00:00:00.000Z") }),
      ],
      DEPARTING_USER
    );

    expect(ordered.map((candidate) => candidate.id)).toEqual(["manager", "editor", "viewer"]);
  });

  it("prefers the earliest-added collaborator within the same role", () => {
    const ordered = orderHeirCandidates(
      [
        member({ id: "later", role: CollaboratorRole.Editor, addedAt: new Date("2026-03-01T00:00:00.000Z") }),
        member({ id: "earlier", role: CollaboratorRole.Editor, addedAt: new Date("2026-02-01T00:00:00.000Z") }),
      ],
      DEPARTING_USER
    );

    expect(ordered.map((candidate) => candidate.id)).toEqual(["earlier", "later"]);
  });

  it("falls back to id order when added times tie, and ranks missing added times last", () => {
    const sameTime = new Date("2026-02-01T00:00:00.000Z");
    const ordered = orderHeirCandidates(
      [
        member({ id: "c", role: CollaboratorRole.Editor, addedAt: null }),
        member({ id: "b", role: CollaboratorRole.Editor, addedAt: sameTime }),
        member({ id: "a", role: CollaboratorRole.Editor, addedAt: sameTime }),
      ],
      DEPARTING_USER
    );

    expect(ordered.map((candidate) => candidate.id)).toEqual(["a", "b", "c"]);
  });

  it("ranks an unrecognised role below viewer", () => {
    const ordered = orderHeirCandidates(
      [member({ id: "odd", role: "owner" }), member({ id: "viewer", role: CollaboratorRole.Viewer })],
      DEPARTING_USER
    );

    expect(ordered.map((candidate) => candidate.id)).toEqual(["viewer", "odd"]);
  });

  it("excludes the departing user and rows without a linked user", () => {
    const ordered = orderHeirCandidates(
      [
        member({ id: "me", userId: DEPARTING_USER, role: CollaboratorRole.Manager }),
        member({ id: "orphan", userId: null, role: CollaboratorRole.Manager }),
        member({ id: "viewer", role: CollaboratorRole.Viewer }),
      ],
      DEPARTING_USER
    );

    expect(ordered.map((candidate) => candidate.id)).toEqual(["viewer"]);
  });
});

describe("buildSharedOwnedTrips", () => {
  const ownedTrips = [
    { id: "trip-shared", name: "Lisbon Escape" },
    { id: "trip-solo", name: "Weekend in Porto" },
    { id: "trip-orphaned", name: "Reykjavik Getaway" },
  ];

  it("returns only trips with another linked member, with collaborators in heir order", () => {
    const sharedTrips = buildSharedOwnedTrips(
      ownedTrips,
      [
        member({ id: "me-shared", tripId: "trip-shared", userId: DEPARTING_USER, role: CollaboratorRole.Manager }),
        member({ id: "ada", tripId: "trip-shared", userId: "user-ada", name: "Ada", role: CollaboratorRole.Viewer }),
        member({ id: "bo", tripId: "trip-shared", userId: "user-bo", name: "Bo", role: CollaboratorRole.Editor }),
        member({ id: "me-solo", tripId: "trip-solo", userId: DEPARTING_USER, role: CollaboratorRole.Manager }),
        member({ id: "me-orphaned", tripId: "trip-orphaned", userId: DEPARTING_USER }),
        member({ id: "ghost", tripId: "trip-orphaned", userId: null, role: CollaboratorRole.Editor }),
      ],
      DEPARTING_USER
    );

    expect(sharedTrips).toEqual<AccountDeletionTrip[]>([
      {
        tripId: "trip-shared",
        name: "Lisbon Escape",
        memberCount: 3,
        collaborators: [
          { userId: "user-bo", name: "Bo", role: CollaboratorRole.Editor },
          { userId: "user-ada", name: "Ada", role: CollaboratorRole.Viewer },
        ],
        suggestedHeirUserId: "user-bo",
      },
    ]);
  });

  it("returns nothing when the user owns no shared trips", () => {
    expect(buildSharedOwnedTrips(ownedTrips, [], DEPARTING_USER)).toEqual([]);
  });
});

describe("areDeletionChoicesValid", () => {
  const sharedTrips: AccountDeletionTrip[] = [
    {
      tripId: "trip-a",
      name: "A",
      memberCount: 2,
      collaborators: [{ userId: "user-ada", name: "Ada", role: CollaboratorRole.Editor }],
      suggestedHeirUserId: "user-ada",
    },
    {
      tripId: "trip-b",
      name: "B",
      memberCount: 2,
      collaborators: [{ userId: "user-bo", name: "Bo", role: CollaboratorRole.Viewer }],
      suggestedHeirUserId: "user-bo",
    },
  ];

  it("accepts one transfer or delete decision per shared trip", () => {
    expect(
      areDeletionChoicesValid(sharedTrips, [
        { tripId: "trip-a", action: TripDeletionAction.Transfer, newOwnerUserId: "user-ada" },
        { tripId: "trip-b", action: TripDeletionAction.Delete },
      ])
    ).toBe(true);
  });

  it("accepts no decisions when there are no shared trips", () => {
    expect(areDeletionChoicesValid([], [])).toBe(true);
  });

  it("rejects a missing decision", () => {
    expect(areDeletionChoicesValid(sharedTrips, [{ tripId: "trip-a", action: TripDeletionAction.Delete }])).toBe(false);
  });

  it("rejects a decision for a trip that is not one of the shared trips", () => {
    expect(
      areDeletionChoicesValid(sharedTrips, [
        { tripId: "trip-a", action: TripDeletionAction.Delete },
        { tripId: "trip-b", action: TripDeletionAction.Delete },
        { tripId: "trip-solo", action: TripDeletionAction.Delete },
      ])
    ).toBe(false);
  });

  it("rejects two decisions for the same trip", () => {
    expect(
      areDeletionChoicesValid(sharedTrips, [
        { tripId: "trip-a", action: TripDeletionAction.Delete },
        { tripId: "trip-a", action: TripDeletionAction.Transfer, newOwnerUserId: "user-ada" },
      ])
    ).toBe(false);
  });

  it("rejects a transfer to someone who is not on that trip", () => {
    expect(
      areDeletionChoicesValid(sharedTrips, [
        { tripId: "trip-a", action: TripDeletionAction.Transfer, newOwnerUserId: "user-bo" },
        { tripId: "trip-b", action: TripDeletionAction.Delete },
      ])
    ).toBe(false);
  });

  it("rejects a transfer to the departing user", () => {
    expect(
      areDeletionChoicesValid(sharedTrips, [
        { tripId: "trip-a", action: TripDeletionAction.Transfer, newOwnerUserId: DEPARTING_USER },
        { tripId: "trip-b", action: TripDeletionAction.Delete },
      ])
    ).toBe(false);
  });

  it("rejects an unknown action", () => {
    const forgedChoice = { tripId: "trip-b", action: "archive" } as unknown as { tripId: string; action: "delete" };
    expect(
      areDeletionChoicesValid(sharedTrips, [{ tripId: "trip-a", action: TripDeletionAction.Delete }, forgedChoice])
    ).toBe(false);
  });
});
