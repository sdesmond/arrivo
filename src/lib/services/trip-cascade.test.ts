// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  checklistItems,
  days,
  documents,
  events,
  expenses,
  itineraryChecklists,
  itineraryNotes,
  notes,
  packingItems,
  reservations,
  tripPackingLists,
} from "@/db/schema";
import type { DbTransaction } from "@/lib/server-action-locks";

const mocks = vi.hoisted(() => ({ recordDeletions: vi.fn() }));
vi.mock("./deletion-records", () => ({ recordDeletions: mocks.recordDeletions }));

import { recordTripCascade, selectTripCascade } from "./trip-cascade";

const TRIP_ID = "trip-1";

const identities = new Map<unknown, string>([
  [days, "day"],
  [events, "event"],
  [reservations, "reservation"],
  [expenses, "expense"],
  [itineraryNotes, "itinerary-note"],
  [itineraryChecklists, "checklist"],
  [checklistItems, "checklist-item"],
  [notes, "trip-note"],
  [tripPackingLists, "packing-list"],
  [packingItems, "packing-item"],
]);

function lockableRows(rows: unknown[]) {
  return Object.assign(Promise.resolve(rows), { for: async () => rows });
}

function createTransaction() {
  return {
    select: () => ({
      from: (table: unknown) => ({
        where: () =>
          lockableRows(
            table === documents
              ? [
                  { id: "document", url: "/file" },
                  { id: "no-file", url: null },
                ]
              : identities.has(table)
                ? [{ id: identities.get(table) }]
                : []
          ),
      }),
    }),
  } as unknown as DbTransaction;
}

beforeEach(() => vi.clearAllMocks());

describe("selectTripCascade", () => {
  it("returns every row that goes with the trip, including documents and their files", async () => {
    const cascade = await selectTripCascade(createTransaction(), TRIP_ID);

    expect(cascade.files).toEqual([
      { id: "document", url: "/file" },
      { id: "no-file", url: null },
    ]);
    for (const resource of identities.values()) {
      if (resource === "document") continue;
      expect(cascade.removed[resource as keyof typeof cascade.removed]).toEqual([{ id: resource }]);
    }
    expect(cascade.removed.document.map(({ id }) => id)).toEqual(["document", "no-file"]);
  });
});

describe("recordTripCascade", () => {
  it("records the trip and each removed resource under the given user", async () => {
    const transaction = createTransaction();
    const cascade = await selectTripCascade(transaction, TRIP_ID);

    await recordTripCascade(transaction, TRIP_ID, cascade, "user-9");

    expect(mocks.recordDeletions).toHaveBeenCalledWith(transaction, "trip", [TRIP_ID], "user-9");
    for (const resource of identities.values()) {
      expect(mocks.recordDeletions).toHaveBeenCalledWith(transaction, resource, [resource], "user-9");
    }
    expect(mocks.recordDeletions).toHaveBeenCalledWith(transaction, "document", ["document", "no-file"], "user-9");
  });
});
