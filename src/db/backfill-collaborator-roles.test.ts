// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";

const { db, eq, setTransactionRows } = vi.hoisted(() => {
  const ownerRolePredicate = Symbol("owner-role-predicate");
  return {
    db: {
      transaction: vi.fn(),
    },
    eq: vi.fn(() => ownerRolePredicate),
    setTransactionRows: (tripRows: TripRow[], collaboratorRows: CollabRow[]) => {
      const updateWhere = vi.fn().mockResolvedValue(undefined);
      const updateSet = vi.fn(() => ({ where: updateWhere }));
      const txUpdate = vi.fn(() => ({ set: updateSet }));
      const tx = {
        select: vi
          .fn()
          .mockReturnValueOnce({ from: vi.fn().mockResolvedValue(tripRows) })
          .mockReturnValueOnce({ from: vi.fn().mockResolvedValue(collaboratorRows) }),
        update: txUpdate,
      };
      db.transaction.mockImplementation(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx));
      return { ownerRolePredicate, tx, txUpdate, updateSet, updateWhere };
    },
  };
});

interface CollabRow {
  tripId: string;
  role: string;
}

interface TripRow {
  tripId: string;
}

vi.mock("./index", () => ({ db }));
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return { ...actual, eq };
});

import { backfillCollaboratorRoles } from "./backfill-collaborator-roles";

describe("backfillCollaboratorRoles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("migrates the single owner row per trip to manager/isCreator in one transaction", async () => {
    const { ownerRolePredicate, tx, txUpdate, updateSet, updateWhere } = setTransactionRows(
      [{ tripId: "trip-1" }, { tripId: "trip-2" }],
      [
        { tripId: "trip-1", role: "owner" },
        { tripId: "trip-1", role: "editor" },
        { tripId: "trip-2", role: "owner" },
        { tripId: "trip-2", role: "viewer" },
      ]
    );

    const result = await backfillCollaboratorRoles();

    expect(result).toEqual({ migratedTripCount: 2 });
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(tx.select).toHaveBeenCalledTimes(2);
    expect(txUpdate).toHaveBeenCalledOnce();
    expect(updateSet).toHaveBeenCalledWith({ role: "manager", isCreator: true });
    expect(eq).toHaveBeenCalledWith(expect.anything(), "owner");
    expect(updateWhere).toHaveBeenCalledWith(ownerRolePredicate);
  });

  it("aborts loudly and writes nothing when a trip has zero owner rows", async () => {
    const { txUpdate } = setTransactionRows(
      [{ tripId: "trip-1" }],
      [
        { tripId: "trip-1", role: "editor" },
        { tripId: "trip-1", role: "viewer" },
      ]
    );

    await expect(backfillCollaboratorRoles()).rejects.toThrow(/trip-1: 0 owner rows/);
    expect(txUpdate).not.toHaveBeenCalled();
  });

  it("aborts loudly and writes nothing when a trip has no collaborator rows", async () => {
    const { txUpdate } = setTransactionRows([{ tripId: "trip-1" }], []);

    await expect(backfillCollaboratorRoles()).rejects.toThrow(/trip-1: 0 owner rows/);
    expect(txUpdate).not.toHaveBeenCalled();
  });

  it("aborts loudly and writes nothing when a trip has multiple owner rows", async () => {
    const { txUpdate } = setTransactionRows(
      [{ tripId: "trip-1" }],
      [
        { tripId: "trip-1", role: "owner" },
        { tripId: "trip-1", role: "owner" },
      ]
    );

    await expect(backfillCollaboratorRoles()).rejects.toThrow(/trip-1: 2 owner rows/);
    expect(txUpdate).not.toHaveBeenCalled();
  });

  it("names every violating trip when multiple trips are malformed", async () => {
    const { txUpdate } = setTransactionRows(
      [{ tripId: "trip-1" }, { tripId: "trip-2" }],
      [
        { tripId: "trip-1", role: "editor" },
        { tripId: "trip-2", role: "owner" },
        { tripId: "trip-2", role: "owner" },
      ]
    );

    await expect(backfillCollaboratorRoles()).rejects.toThrow(/trip-1: 0 owner rows[\s\S]*trip-2: 2 owner rows/);
    expect(txUpdate).not.toHaveBeenCalled();
  });
});
