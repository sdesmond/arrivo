// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockDbSelect } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: mockDbSelect,
  },
}));

vi.mock("@/db/schema", () => ({
  invitations: {
    id: "invitations.id",
    tripId: "invitations.tripId",
    email: "invitations.email",
    role: "invitations.role",
    status: "invitations.status",
    expiresAt: "invitations.expiresAt",
    invitedBy: "invitations.invitedBy",
  },
  trips: { id: "trips.id", name: "trips.name" },
  users: { id: "users.id", name: "users.name", email: "users.email" },
}));

import { getMyPendingInvitations, hasNormalizedEmail, normalizeEmail } from "@/lib/invitations";
import { users } from "@/db/schema";

describe("normalizeEmail", () => {
  it("trims surrounding whitespace and lowercases email addresses", () => {
    expect(normalizeEmail("  Foo.Bar@Example.COM  ")).toBe("foo.bar@example.com");
  });
});

describe("hasNormalizedEmail", () => {
  it("builds a case- and whitespace-insensitive equality condition against the given column", () => {
    const condition = hasNormalizedEmail(users.email, "invitee@example.com");
    const chunks = condition.queryChunks;

    expect(chunks[0]).toMatchObject({ value: ["lower(trim("] });
    expect(chunks[1]).toBe(users.email);
    expect(chunks[2]).toMatchObject({ value: [")) = "] });
    expect(chunks[3]).toBe("invitee@example.com");
  });
});

describe("getMyPendingInvitations", () => {
  function mockQueryResult(rows: unknown[]) {
    const where = vi.fn(async (_condition: unknown) => rows);
    const innerJoin2 = vi.fn(() => ({ where }));
    const innerJoin1 = vi.fn(() => ({ innerJoin: innerJoin2 }));
    const from = vi.fn(() => ({ innerJoin: innerJoin1 }));
    mockDbSelect.mockReturnValue({ from });
    return { from, innerJoin1, innerJoin2, where };
  }

  it("maps joined rows to PendingInvitation, normalizing the lookup email", async () => {
    const expiresAt = new Date("2026-09-10T00:00:00.000Z");
    mockQueryResult([
      {
        id: "invitation-1",
        tripId: "trip-1",
        tripName: "Kyoto Trip",
        inviterName: "Ada Lovelace",
        inviterEmail: "ada@example.com",
        role: "editor",
        expiresAt,
      },
    ]);

    const result = await getMyPendingInvitations("  Someone@Example.COM ");

    expect(result).toEqual([
      {
        id: "invitation-1",
        tripId: "trip-1",
        tripName: "Kyoto Trip",
        inviterName: "Ada Lovelace",
        inviterEmail: "ada@example.com",
        role: "editor",
        expiresAt: expiresAt.toISOString(),
      },
    ]);
  });

  it("falls back to the inviter email when the inviter has no display name", async () => {
    const expiresAt = new Date("2026-09-10T00:00:00.000Z");
    mockQueryResult([
      {
        id: "invitation-2",
        tripId: "trip-2",
        tripName: "Oslo Trip",
        inviterName: null,
        inviterEmail: "manager@example.com",
        role: "viewer",
        expiresAt,
      },
    ]);

    const result = await getMyPendingInvitations("someone@example.com");

    expect(result[0].inviterName).toBe("manager@example.com");
  });

  it("returns an empty array when there are no pending, unexpired invitations", async () => {
    const { where } = mockQueryResult([]);

    const result = await getMyPendingInvitations("someone@example.com");

    expect(result).toEqual([]);
    const condition = where.mock.calls[0]?.[0] as { queryChunks: unknown[] };
    expect(JSON.stringify(condition.queryChunks)).toContain("pending");
    expect(JSON.stringify(condition.queryChunks)).toContain("now()");
  });
});
