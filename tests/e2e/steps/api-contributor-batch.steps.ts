import { expect, type APIResponse, type Page } from "@playwright/test";
import { and, asc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { collaborators } from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import { apiClient } from "../anonymous-api";
import { Given, Then, When } from "../fixtures";

interface ContributorBatchState {
  tripId: string;
  editorSeat: string;
  viewerSeat: string;
  creatorSeat: string;
  selfSeat: string;
  foreignSeat: string;
  /** Unique per scenario so keyed requests never collide across parallel workers. */
  keyPrefix: string;
  before?: Awaited<ReturnType<typeof seatSnapshot>>;
  response?: APIResponse;
}

const batchStates = new WeakMap<Page, ContributorBatchState>();

function batchState(page: Page): ContributorBatchState {
  const current = batchStates.get(page);
  if (!current) throw new Error("Contributor batch API fixture missing");
  return current;
}

async function seatSnapshot(tripId: string) {
  return withE2EDb((database) =>
    database
      .select({ id: collaborators.id, userId: collaborators.userId, role: collaborators.role })
      .from(collaborators)
      .where(eq(collaborators.tripId, tripId))
      .orderBy(asc(collaborators.id))
  );
}

function batchBody(current: ContributorBatchState, kind: string): unknown {
  const demoteEditor = { type: "role", collaboratorId: current.editorSeat, fromRole: "editor", toRole: "viewer" };
  const removeViewer = { type: "remove", collaboratorId: current.viewerSeat };
  switch (kind) {
    case "mixed":
      return { changes: [demoteEditor, removeViewer] };
    case "changed":
      return { changes: [removeViewer] };
    case "empty":
      return { changes: [] };
    case "oversized":
      return { changes: Array.from({ length: 51 }, () => ({ type: "remove", collaboratorId: randomUUID() })) };
    case "duplicate":
      return { changes: [removeViewer, removeViewer] };
    case "bad-type":
      return { changes: [{ type: "archive", collaboratorId: current.viewerSeat }] };
    case "bad-role":
      return { changes: [{ ...demoteEditor, toRole: "owner" }] };
    case "bad-uuid":
      return { changes: [{ type: "remove", collaboratorId: "not-a-uuid" }] };
    case "creator":
      return {
        changes: [{ type: "role", collaboratorId: current.creatorSeat, fromRole: "manager", toRole: "editor" }],
      };
    case "self":
      return { changes: [{ type: "remove", collaboratorId: current.selfSeat }] };
    case "stale-role":
      return { changes: [{ ...demoteEditor, fromRole: "viewer" }] };
    case "missing-target":
      return { changes: [{ type: "remove", collaboratorId: randomUUID() }] };
    case "foreign-target":
      return { changes: [{ type: "remove", collaboratorId: current.foreignSeat }] };
    // A valid first change followed by a stale one: the first must not survive.
    case "rollback":
      return { changes: [demoteEditor, { type: "remove", collaboratorId: randomUUID() }] };
    default:
      throw new Error(`Unknown contributor batch ${kind}`);
  }
}

Given("a contributor batch API trip", async ({ page, scenario }) => {
  const trip = scenario.currentTrip!;
  const actor = scenario.currentUser!;
  const [{ user: editor }, { user: viewer }, { user: creator }, { trip: foreignTrip }] = await Promise.all([
    scenario.materialize({ user: { setCurrent: false } }),
    scenario.materialize({ user: { setCurrent: false } }),
    scenario.materialize({ user: { setCurrent: false } }),
    scenario.materialize({ trip: { mother: "datelessTrip", setCurrent: false } }),
  ]);
  if (!editor || !viewer || !creator || !foreignTrip) throw new Error("Contributor batch fixture missing");
  const seats = await withE2EDb(async (database) => {
    // The actor stays a manager but gives up the creator flag, so the creator and self guards are distinct seats.
    const [self] = await database
      .update(collaborators)
      .set({ isCreator: false })
      .where(and(eq(collaborators.tripId, trip.id), eq(collaborators.userId, actor.id)))
      .returning({ id: collaborators.id });
    const inserted = await database
      .insert(collaborators)
      .values([
        { tripId: trip.id, userId: editor.id, name: "Batch Editor", initials: "BE", role: "editor", isCreator: false },
        { tripId: trip.id, userId: viewer.id, name: "Batch Viewer", initials: "BV", role: "viewer", isCreator: false },
        {
          tripId: trip.id,
          userId: creator.id,
          name: "Batch Creator",
          initials: "BC",
          role: "manager",
          isCreator: true,
        },
      ])
      .returning({ id: collaborators.id, userId: collaborators.userId });
    const [foreign] = await database
      .select({ id: collaborators.id })
      .from(collaborators)
      .where(eq(collaborators.tripId, foreignTrip.id));
    const seatOf = (userId: string) => inserted.find((row) => row.userId === userId)!.id;
    return {
      selfSeat: self.id,
      editorSeat: seatOf(editor.id),
      viewerSeat: seatOf(viewer.id),
      creatorSeat: seatOf(creator.id),
      foreignSeat: foreign.id,
    };
  });
  batchStates.set(page, { tripId: trip.id, ...seats, keyPrefix: `batch-${randomUUID()}` });
});

When("I send the contributor batch {string} with {string} key", async ({ page }, kind: string, key: string) => {
  const current = batchState(page);
  current.before ??= await seatSnapshot(current.tripId);
  const client = await apiClient(page);
  current.response = await client.patch(`/api/v1/trips/${current.tripId}/collaborators`, {
    headers: {
      "x-arrivo-client": "web",
      "content-type": "application/json",
      origin: new URL(page.url()).origin,
      ...(key === "none" ? {} : { "Idempotency-Key": `${current.keyPrefix}-${key}` }),
    },
    data: batchBody(current, kind),
  });
});

Then("the contributor batch API returns {int} and the mixed batch persisted", async ({ page }, status: number) => {
  const current = batchState(page);
  expect(current.response!.status()).toBe(status);
  expect(current.response!.headers()["cache-control"]).toBe("no-store");
  if (status === 200) expect(await current.response!.json()).toEqual({ status: "success" });
  else expect((await current.response!.json()).error.code).toBe("conflict");
  const expected = current
    .before!.filter((seat) => seat.id !== current.viewerSeat)
    .map((seat) => (seat.id === current.editorSeat ? { ...seat, role: "viewer" } : seat));
  expect(await seatSnapshot(current.tripId)).toEqual(expected);
});

Then("the contributor batch API returns 200 without changing seats", async ({ page }) => {
  const current = batchState(page);
  expect(current.response!.status()).toBe(200);
  expect(await current.response!.json()).toEqual({ status: "success" });
  expect(await seatSnapshot(current.tripId)).toEqual(current.before);
});

Then(
  "the contributor batch API rejects with {int} and {string} without writes",
  async ({ page }, status: number, code: string) => {
    const current = batchState(page);
    expect(current.response!.status()).toBe(status);
    expect((await current.response!.json()).error.code).toBe(code);
    expect(await seatSnapshot(current.tripId)).toEqual(current.before);
  }
);

Then("the contributor batch snapshot is refreshed", async ({ page }) => {
  const current = batchState(page);
  current.before = await seatSnapshot(current.tripId);
});
