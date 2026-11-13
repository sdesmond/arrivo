// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  role: vi.fn(),
  lock: vi.fn(),
  queue: vi.fn(),
  remove: vi.fn(),
  effects: vi.fn(),
  update: vi.fn(),
  replay: false,
  commitError: false,
  row: undefined as Record<string, unknown> | undefined,
  input: undefined as unknown,
}));
vi.mock("./trip-access", async (original) => ({
  ...(await original<typeof import("./trip-access")>()),
  requireTripRole: mocks.role,
}));
vi.mock("@/lib/file-cleanup", () => ({ queueFileDeletions: mocks.queue, removeQueuedFiles: mocks.remove }));
vi.mock("./trip-write", () => ({
  lockTrip: mocks.lock,
  runTripWrite: async (
    _actor: unknown,
    _tripId: string,
    input: unknown,
    steps: (
      transaction: unknown,
      changed: () => void
    ) => { authorize: () => Promise<void>; mutate: () => Promise<null> }
  ) => {
    mocks.input = input;
    const transaction = {
      select: () => ({ from: () => ({ where: async () => (mocks.row ? [mocks.row] : []) }) }),
      update: () => ({ set: (patch: unknown) => ({ where: async () => mocks.update(patch) }) }),
    };
    let changed = false;
    const handlers = steps(transaction, () => {
      changed = true;
    });
    await handlers.authorize();
    if (mocks.replay) return null;
    const result = await handlers.mutate();
    if (mocks.commitError) throw new Error("commit failed");
    if (changed) mocks.effects();
    return result;
  },
}));
import { setTripCover, removeTripCover } from "./covers";
import { TripForbiddenError, TripNotFoundError } from "./trip-access";
import { deriveGraphicCover } from "@/lib/utils";
const tripId = "223e4567-e89b-12d3-a456-426614174000";
const actor = { userId: "user" };
const own = `/api/storage/trip-covers/${tripId}/map.png`;
const body = {
  coverImageUrl: "https://images.unsplash.com/photo",
  coverPhotographer: "Photo",
  coverPhotographerUrl: "https://unsplash.com/@photo",
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.row = { name: "Locked name", coverImageUrl: own, coverPhotographer: null, coverPhotographerUrl: null };
  mocks.replay = false;
  mocks.commitError = false;
  mocks.queue.mockImplementation(async (_transaction: unknown, urls: string[]) =>
    urls.map((url) => ({ id: "queue", url }))
  );
});
it("replaces all fields under lock and cleans own stored map after effects/commit", async () => {
  await expect(setTripCover(actor, tripId.toUpperCase(), body)).resolves.toBeNull();
  expect(mocks.role).toHaveBeenNthCalledWith(1, tripId, "user", "editor");
  expect(mocks.role).toHaveBeenNthCalledWith(2, tripId, "user", "editor", expect.anything());
  expect(mocks.lock).toHaveBeenCalledBefore(mocks.update);
  expect(mocks.update).toHaveBeenCalledWith(body);
  expect(mocks.queue).toHaveBeenCalledWith(expect.anything(), [own]);
  expect(mocks.effects).toHaveBeenCalledBefore(mocks.remove);
  expect(mocks.remove).toHaveBeenCalledWith([{ id: "queue", url: own }]);
});
it("derives removal graphic from locked current name and clears attribution", async () => {
  mocks.lock.mockImplementation(async () => {
    mocks.row!.name = "Renamed under lock";
  });
  await removeTripCover(actor, tripId, {});
  expect(mocks.update).toHaveBeenCalledWith({
    coverImageUrl: deriveGraphicCover("Renamed under lock"),
    coverPhotographer: null,
    coverPhotographerUrl: null,
  });
});
it.each([
  "https://images.unsplash.com/old",
  "graphic:blue/dots/plane",
  `/api/storage/trip-covers/423e4567-e89b-12d3-a456-426614174000/map.png`,
  `/api/storage/trip-documents/${tripId}/map.png`,
])("never queues external or foreign cover %s", async (coverImageUrl) => {
  mocks.row!.coverImageUrl = coverImageUrl;
  await setTripCover(actor, tripId, body);
  expect(mocks.queue).not.toHaveBeenCalled();
});
it("retains current stored file when only attribution changes", async () => {
  await setTripCover(actor, tripId, { ...body, coverImageUrl: own });
  expect(mocks.queue).not.toHaveBeenCalled();
});
it.each([setTripCover, removeTripCover])("does no writes/effects on identical state", async (write) => {
  mocks.row = {
    name: "Locked name",
    ...(write === setTripCover
      ? body
      : { coverImageUrl: deriveGraphicCover("Locked name"), coverPhotographer: null, coverPhotographerUrl: null }),
  };
  await write(actor, tripId, write === setTripCover ? body : {});
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.queue).not.toHaveBeenCalled();
  expect(mocks.effects).not.toHaveBeenCalled();
});
it.each([new TripForbiddenError("editor"), new TripNotFoundError()])(
  "rejects denied access before and under lock",
  async (error) => {
    mocks.role.mockRejectedValueOnce(error);
    await expect(setTripCover(actor, tripId, body)).rejects.toBe(error);
    mocks.role.mockResolvedValueOnce("editor").mockRejectedValueOnce(error);
    await expect(removeTripCover(actor, tripId, {})).rejects.toBe(error);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.queue).not.toHaveBeenCalled();
  }
);
it("conceals missing locked trip", async () => {
  mocks.row = undefined;
  await expect(removeTripCover(actor, tripId, {})).rejects.toBeInstanceOf(TripNotFoundError);
});
it.each(["update", "queue", "commit"])("retains stored file on %s rollback", async (failure) => {
  if (failure === "update") mocks.update.mockRejectedValueOnce(new Error("update failed"));
  if (failure === "queue") mocks.queue.mockRejectedValueOnce(new Error("queue failed"));
  if (failure === "commit") mocks.commitError = true;
  await expect(setTripCover(actor, tripId, body)).rejects.toThrow();
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(mocks.effects).not.toHaveBeenCalled();
});
it("passes keyed replay through without writes or cleanup", async () => {
  mocks.replay = true;
  const replay = { key: "cover", method: "PUT", path: `/api/v1/trips/${tripId}/cover` };
  await setTripCover(actor, tripId, body, replay);
  expect(mocks.input).toEqual({ replay, payload: body });
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.queue).not.toHaveBeenCalled();
  expect(mocks.effects).not.toHaveBeenCalled();
});
it.each([
  { coverImageUrl: `/api/storage/trip-covers/423e4567-e89b-12d3-a456-426614174000/map.png` },
  { ...body, extra: true },
  { ...body, coverPhotographerUrl: "javascript:alert(1)" },
])("validates service input before access/write", async (input) => {
  await expect(setTripCover(actor, tripId, input)).rejects.toThrow();
  expect(mocks.role).not.toHaveBeenCalled();
});
