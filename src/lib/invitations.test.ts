// @vitest-environment node
import { inspect } from "node:util";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockAssertTripAccess, mockDbSelect, mockDbUpdate } = vi.hoisted(() => ({
  mockAssertTripAccess: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbUpdate: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
  },
}));

vi.mock("@/lib/auth-helpers", () => ({
  assertTripAccess: mockAssertTripAccess,
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

import { getMyPendingInvitations, hasNormalizedEmail, normalizeEmail, resendInvitation } from "@/lib/invitations";
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
    const { where } = mockQueryResult([
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
    const condition = where.mock.calls[0]?.[0] as { queryChunks: unknown[] };
    const conditionText = JSON.stringify(condition.queryChunks);
    expect(conditionText).toContain("pending");
    expect(conditionText).toContain("> now()");
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

  it("excludes expired pending invitations", async () => {
    const { where } = mockQueryResult([]);

    const result = await getMyPendingInvitations("someone@example.com");

    expect(result).toEqual([]);
    const condition = where.mock.calls[0]?.[0] as { queryChunks: unknown[] };
    const conditionText = JSON.stringify(condition.queryChunks);
    // Checks the comparison direction specifically — a flipped `expiresAt < now()` would still
    // contain the substrings "pending" and "now()" but not this exact "> now()" fragment.
    expect(conditionText).toContain("pending");
    expect(conditionText).toContain("> now()");
  });
});

describe("resendInvitation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertTripAccess.mockResolvedValue(undefined);
  });

  function setupResendInvitationDb({
    matchedRow = null,
    diagnosticRow = null,
  }: {
    matchedRow?: { id: string; tripId: string } | null;
    diagnosticRow?: { id: string; tripId: string } | null;
  } = {}) {
    const updates: Array<{ values: unknown; condition: unknown }> = [];
    mockDbSelect.mockReturnValue({
      from: () => ({
        where: async () => (diagnosticRow ? [diagnosticRow] : []),
      }),
    });

    mockDbUpdate.mockImplementation(() => ({
      set: (values: unknown) => ({
        where: (condition: unknown) => {
          updates.push({ values, condition });
          return { returning: async () => (matchedRow ? [matchedRow] : []) };
        },
      }),
    }));

    return { updates };
  }

  it("resets a pending invitation expiry for a trip manager", async () => {
    const now = new Date("2026-09-03T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const expiresAt = new Date(now.getTime() + 72 * 60 * 60 * 1000);
    const { updates } = setupResendInvitationDb({ matchedRow: { id: "invite-1", tripId: "trip-1" } });

    await expect(resendInvitation("invite-1", "trip-1", "manager-1")).resolves.toEqual({
      status: "success",
      expiresAt: expiresAt.toISOString(),
    });

    expect(mockAssertTripAccess).toHaveBeenCalledWith("trip-1", "manager-1", "manager");
    expect(updates).toEqual([
      expect.objectContaining({
        values: { expiresAt },
        condition: expect.anything(),
      }),
    ]);
    expect(inspect(updates[0]?.condition, { depth: 8 })).toContain("pending");
    vi.useRealTimers();
  });

  it("rejects a non-pending invitation (rescinded, accepted, declined, or expired)", async () => {
    const { updates } = setupResendInvitationDb({ diagnosticRow: { id: "invite-1", tripId: "trip-1" } });

    await expect(resendInvitation("invite-1", "trip-1", "manager-1")).resolves.toEqual({
      status: "error",
      message: "Invitation is no longer pending.",
    });

    expect(updates).toHaveLength(1);
    expect(inspect(updates[0]?.condition, { depth: 8 })).toContain("pending");
  });

  it("rejects a missing invitation", async () => {
    setupResendInvitationDb();

    await expect(resendInvitation("missing", "trip-1", "manager-1")).resolves.toEqual({
      status: "error",
      message: "Invitation not found.",
    });
  });

  it("rejects an invitation belonging to another trip", async () => {
    setupResendInvitationDb({ diagnosticRow: { id: "invite-2", tripId: "trip-2" } });

    await expect(resendInvitation("invite-2", "trip-1", "manager-1")).resolves.toEqual({
      status: "error",
      message: "Invitation not found.",
    });
  });

  it("rejects an editor before reading or writing invitations", async () => {
    mockAssertTripAccess.mockRejectedValue(new Error("not found"));

    await expect(resendInvitation("invite-1", "trip-1", "editor-1")).rejects.toThrow("not found");

    expect(mockDbUpdate).not.toHaveBeenCalled();
    expect(mockDbSelect).not.toHaveBeenCalled();
  });
});
