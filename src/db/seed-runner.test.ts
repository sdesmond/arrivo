// @vitest-environment node
import { describe, expect, it } from "vitest";
import { validateSeedWorld } from "./seed-runner";
import { DEV_SEED } from "./seed-data";
import type { SeedWorld } from "./seed-data/seed-types";

function baseWorld(): SeedWorld {
  return {
    users: [
      {
        key: "owner",
        username: "owner",
        name: "Owner",
        initials: "OW",
        currency: "USD",
        dateFormat: "MM/DD/YYYY",
      },
      {
        key: "other",
        username: "other",
        name: "Other",
        initials: "OT",
        currency: "USD",
        dateFormat: "MM/DD/YYYY",
      },
    ],
    trips: [
      { key: "dated", ownerKey: "owner", name: "Dated Trip", startOffsetDays: 0, endOffsetDays: 3 },
      { key: "dateless", ownerKey: "owner", name: "Dateless Trip", startOffsetDays: null, endOffsetDays: null },
    ],
    shares: [],
    invitations: [],
  };
}

describe("validateSeedWorld — the real dev seed", () => {
  it("accepts DEV_SEED as valid", () => {
    expect(() => validateSeedWorld(DEV_SEED)).not.toThrow();
  });

  it("seeds four accounts", () => {
    expect(DEV_SEED.users).toHaveLength(4);
    expect(DEV_SEED.users.map((seedUser) => seedUser.username).sort()).toEqual(["alex", "demo", "jordan", "sam"]);
  });

  it("seeds six trips, exactly one owner-manager collaborator each (enforced structurally: one owner per trip)", () => {
    expect(DEV_SEED.trips).toHaveLength(6);
    const ownerKeys = new Set(DEV_SEED.trips.map((trip) => trip.ownerKey));
    expect(ownerKeys.has("demo")).toBe(true);
    expect(ownerKeys.has("alex")).toBe(true);
  });

  it("has at least one dateless trip", () => {
    expect(DEV_SEED.trips.some((trip) => trip.startOffsetDays === null && trip.endOffsetDays === null)).toBe(true);
  });

  it("spans the run date on Tokyo (active) while Kyoto/Marrakech end before it and Lisbon starts after it", () => {
    const tokyo = DEV_SEED.trips.find((trip) => trip.key === "tokyo")!;
    const kyoto = DEV_SEED.trips.find((trip) => trip.key === "kyoto")!;
    const marrakech = DEV_SEED.trips.find((trip) => trip.key === "marrakech")!;
    const lisbon = DEV_SEED.trips.find((trip) => trip.key === "lisbon")!;

    expect(tokyo.startOffsetDays).toBeLessThanOrEqual(0);
    expect(tokyo.endOffsetDays).toBeGreaterThanOrEqual(0);
    expect(kyoto.endOffsetDays).toBeLessThan(0);
    expect(marrakech.endOffsetDays).toBeLessThan(0);
    expect(lisbon.startOffsetDays).toBeGreaterThan(0);
  });

  it("shares Tokyo (editor) and Patagonia (viewer) from Demo to Alex, and Lisbon (editor) from Alex to Demo", () => {
    expect(DEV_SEED.shares).toEqual(
      expect.arrayContaining([
        { tripKey: "tokyo", userKey: "alex", role: "editor" },
        { tripKey: "patagonia", userKey: "alex", role: "viewer" },
        { tripKey: "lisbon", userKey: "demo", role: "editor" },
      ])
    );
  });

  it("has a pending invitation to Sam and a declined invitation to Jordan", () => {
    const pending = DEV_SEED.invitations.find((invitation) => invitation.status === "pending")!;
    const declined = DEV_SEED.invitations.find((invitation) => invitation.status === "declined")!;

    expect(pending.inviteeUserKey).toBe("sam");
    expect(declined.inviteeUserKey).toBe("jordan");
  });

  it("every packing item's `under` reference resolves to a label in the same trip", () => {
    for (const trip of DEV_SEED.trips) {
      const labelNames = new Set((trip.packingItems ?? []).filter((item) => item.isLabel).map((item) => item.name));
      for (const item of trip.packingItems ?? []) {
        if (item.under) expect(labelNames.has(item.under)).toBe(true);
      }
    }
  });

  it("every event's dayNumber exists on its trip (or is null for unscheduled)", () => {
    for (const trip of DEV_SEED.trips) {
      const dayNumbers = new Set((trip.days ?? []).map((day) => day.dayNumber));
      for (const event of trip.events ?? []) {
        if (event.dayNumber != null) expect(dayNumbers.has(event.dayNumber)).toBe(true);
      }
    }
  });
});

describe("validateSeedWorld — negative cases", () => {
  it("throws on a duplicate day number within a trip", () => {
    const world = baseWorld();
    world.trips[0].days = [
      { dayNumber: 1, label: "Day 1" },
      { dayNumber: 1, label: "Also day 1" },
    ];
    expect(() => validateSeedWorld(world)).toThrow(/duplicate dayNumber/i);
  });

  it("throws on a share with an unknown user key", () => {
    const world = baseWorld();
    world.shares = [{ tripKey: "dated", userKey: "ghost", role: "viewer" }];
    expect(() => validateSeedWorld(world)).toThrow(/unknown user key/i);
  });

  it("throws on a packing item under a label that doesn't exist", () => {
    const world = baseWorld();
    world.trips[0].packingItems = [{ name: "Passport", isLabel: false, done: false, position: 0, under: "Documents" }];
    expect(() => validateSeedWorld(world)).toThrow(/unknown label/i);
  });

  it("throws on a duplicate username", () => {
    const world = baseWorld();
    world.users[1].username = "owner";
    expect(() => validateSeedWorld(world)).toThrow(/duplicate seed username/i);
  });

  it("throws on an invitation to an unknown user key", () => {
    const world = baseWorld();
    world.invitations = [
      {
        tripKey: "dated",
        inviteeUserKey: "ghost",
        role: "viewer",
        status: "pending",
        expiresInHours: 72,
        invitedByUserKey: "owner",
      },
    ];
    expect(() => validateSeedWorld(world)).toThrow(/unknown inviteeUserKey/i);
  });

  it("throws on two pending invitations for the same trip and invitee", () => {
    const world = baseWorld();
    world.invitations = [
      {
        tripKey: "dated",
        inviteeUserKey: "other",
        role: "viewer",
        status: "pending",
        expiresInHours: 72,
        invitedByUserKey: "owner",
      },
      {
        tripKey: "dated",
        inviteeUserKey: "other",
        role: "editor",
        status: "pending",
        expiresInHours: 48,
        invitedByUserKey: "owner",
      },
    ];
    expect(() => validateSeedWorld(world)).toThrow(/duplicate pending invitation/i);
  });

  it("throws when no trip in the world is dateless", () => {
    const world = baseWorld();
    world.trips[1].startOffsetDays = 10;
    world.trips[1].endOffsetDays = 12;
    expect(() => validateSeedWorld(world)).toThrow(/at least one trip with no dates/i);
  });

  it("throws when a trip is shared with its own owner", () => {
    const world = baseWorld();
    world.shares = [{ tripKey: "dated", userKey: "owner", role: "editor" }];
    expect(() => validateSeedWorld(world)).toThrow(/cannot be shared with its own owner/i);
  });

  it("throws on a duplicate event position within the same day", () => {
    const world = baseWorld();
    world.trips[0].days = [{ dayNumber: 1, label: "Day 1" }];
    world.trips[0].events = [
      { key: "a", name: "A", dayNumber: 1, position: 0 },
      { key: "b", name: "B", dayNumber: 1, position: 0 },
    ];
    expect(() => validateSeedWorld(world)).toThrow(/duplicate event position/i);
  });
});
