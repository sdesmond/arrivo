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
  discard: vi.fn(),
  put: vi.fn(),
  committed: [] as Record<string, unknown>[],
}));
vi.mock("@/db", () => ({ db: { select: () => ({ from: () => ({ where: async () => mocks.committed }) }) } }));
vi.mock("@/lib/storage/storage-adapter", () => ({ getStorageAdapter: () => ({ put: mocks.put }) }));
vi.mock("./trip-access", async (original) => ({
  ...(await original<typeof import("./trip-access")>()),
  requireTripRole: mocks.role,
}));
vi.mock("@/lib/file-cleanup", () => ({
  queueFileDeletions: mocks.queue,
  removeQueuedFiles: mocks.remove,
  discardStoredFile: mocks.discard,
}));
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
import { setTripCover, removeTripCover, uploadTripCoverImage } from "./covers";
import { TripForbiddenError, TripNotFoundError } from "./trip-access";
import { deriveGraphicCover, MAX_COVER_IMAGE_UPLOAD_BYTES } from "@/lib/utils";
import { UploadInvalidError, UploadTooLargeError } from "@/lib/upload-policy";
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
  mocks.committed = [];
  mocks.queue.mockImplementation(async (_transaction: unknown, urls: string[]) =>
    urls.map((url) => ({ id: "queue", url }))
  );
  mocks.put.mockImplementation(async (key: string) => `/api/storage/${key}`);
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
const gif = () => new File(["GIF89a-bytes"], "cover.gif", { type: "image/gif" });
const png = () =>
  new File([Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "c.png", { type: "image/png" });
const newCover = expect.stringMatching(new RegExp(`^/api/storage/trip-covers/${tripId}/.+\.gif$`));
it("stores the upload, replaces the cover, clears attribution, queues the old own file, then removes it after effects", async () => {
  mocks.row!.coverPhotographer = "Photo";
  mocks.row!.coverPhotographerUrl = "https://unsplash.com/@photo";
  await expect(uploadTripCoverImage(actor, tripId.toUpperCase(), {}, gif())).resolves.toBeNull();
  expect(mocks.role).toHaveBeenNthCalledWith(1, tripId, "user", "editor");
  expect(mocks.role).toHaveBeenNthCalledWith(2, tripId, "user", "editor", expect.anything());
  expect(mocks.put).toHaveBeenCalledWith(expect.stringMatching(/^trip-covers\/.+\.gif$/), expect.any(File));
  expect(mocks.put).toHaveBeenCalledBefore(mocks.lock);
  expect(mocks.lock).toHaveBeenCalledBefore(mocks.update);
  expect(mocks.update).toHaveBeenCalledWith({
    coverImageUrl: newCover,
    coverPhotographer: null,
    coverPhotographerUrl: null,
  });
  expect(mocks.queue).toHaveBeenCalledWith(expect.anything(), [own]);
  expect(mocks.effects).toHaveBeenCalledTimes(1);
  expect(mocks.effects).toHaveBeenCalledBefore(mocks.remove);
  expect(mocks.remove).toHaveBeenCalledWith([{ id: "queue", url: own }]);
  expect(mocks.discard).not.toHaveBeenCalled();
  expect(mocks.input).toEqual({ payload: {} });
});
it("accepts every cover type the policy allows, such as a PNG", async () => {
  await uploadTripCoverImage(actor, tripId, {}, png());
  expect(mocks.put).toHaveBeenCalledWith(expect.stringMatching(/\.png$/), expect.any(File));
});
it.each([
  "https://images.unsplash.com/old",
  "graphic:blue/dots/plane",
  "/api/mapbox/static?lng=1&lat=2",
  `/api/storage/trip-covers/423e4567-e89b-12d3-a456-426614174000/map.png`,
  `/api/storage/trip-documents/${tripId}/map.png`,
])("never queues a previous cover that is not this trip's own file (%s)", async (coverImageUrl) => {
  mocks.row!.coverImageUrl = coverImageUrl;
  await uploadTripCoverImage(actor, tripId, {}, gif());
  expect(mocks.update).toHaveBeenCalled();
  expect(mocks.queue).not.toHaveBeenCalled();
  expect(mocks.remove).not.toHaveBeenCalled();
});
it("queues nothing when the trip has no previous cover", async () => {
  mocks.row!.coverImageUrl = null;
  await uploadTripCoverImage(actor, tripId, {}, gif());
  expect(mocks.queue).not.toHaveBeenCalled();
});
it("rejects an oversize file, a disallowed type and mismatched bytes before storing", async () => {
  const oversize = gif();
  Object.defineProperty(oversize, "size", { value: MAX_COVER_IMAGE_UPLOAD_BYTES + 1 });
  await expect(uploadTripCoverImage(actor, tripId, {}, oversize)).rejects.toBeInstanceOf(UploadTooLargeError);
  await expect(
    uploadTripCoverImage(actor, tripId, {}, new File(["x"], "c.svg", { type: "image/svg+xml" }))
  ).rejects.toBeInstanceOf(UploadInvalidError);
  await expect(
    uploadTripCoverImage(actor, tripId, {}, new File(["<html>"], "c.gif", { type: "image/gif" }))
  ).rejects.toBeInstanceOf(UploadInvalidError);
  expect(mocks.put).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
});
it.each([new TripForbiddenError("editor"), new TripNotFoundError()])(
  "refuses a viewer or stranger before storing anything",
  async (error) => {
    mocks.role.mockRejectedValueOnce(error);
    await expect(uploadTripCoverImage(actor, tripId, {}, gif())).rejects.toBe(error);
    expect(mocks.put).not.toHaveBeenCalled();
  }
);
it("removes the new file when the role is lost under the lock", async () => {
  const error = new TripForbiddenError("editor");
  mocks.role.mockResolvedValueOnce("editor").mockRejectedValueOnce(error);
  await expect(uploadTripCoverImage(actor, tripId, {}, gif())).rejects.toBe(error);
  expect(mocks.put).toHaveBeenCalledTimes(1);
  expect(mocks.discard).toHaveBeenCalledWith(await mocks.put.mock.results[0].value);
  expect(mocks.update).not.toHaveBeenCalled();
});
it("conceals a trip that vanished under the lock and removes the new file", async () => {
  mocks.row = undefined;
  await expect(uploadTripCoverImage(actor, tripId, {}, gif())).rejects.toBeInstanceOf(TripNotFoundError);
  expect(mocks.discard).toHaveBeenCalledTimes(1);
});
it.each(["update", "queue", "commit"])(
  "keeps the old cover and removes the new file on %s rollback",
  async (failure) => {
    if (failure === "update") mocks.update.mockRejectedValueOnce(new Error("update failed"));
    if (failure === "queue") mocks.queue.mockRejectedValueOnce(new Error("queue failed"));
    if (failure === "commit") mocks.commitError = true;
    await expect(uploadTripCoverImage(actor, tripId, {}, gif())).rejects.toThrow();
    expect(mocks.discard).toHaveBeenCalledWith(await mocks.put.mock.results[0].value);
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.effects).not.toHaveBeenCalled();
  }
);
it("keeps the new file, and leaves the old one queued, when a step after the commit fails", async () => {
  mocks.effects.mockImplementationOnce(() => {
    throw new Error("effect failed");
  });
  mocks.committed = [{ id: tripId }];
  await expect(uploadTripCoverImage(actor, tripId, {}, gif())).rejects.toThrow("effect failed");
  expect(mocks.discard).not.toHaveBeenCalled();
  expect(mocks.remove).not.toHaveBeenCalled();
});
it("writes nothing when storage fails", async () => {
  mocks.put.mockRejectedValueOnce(new Error("disk full"));
  await expect(uploadTripCoverImage(actor, tripId, {}, gif())).rejects.toThrow("disk full");
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.discard).not.toHaveBeenCalled();
});
it("leaves a durable queue row for the old file, so a failed removal is retried from the queue", async () => {
  await expect(uploadTripCoverImage(actor, tripId, {}, gif())).resolves.toBeNull();
  expect(mocks.queue).toHaveBeenCalledTimes(1);
  expect(mocks.remove).toHaveBeenCalledTimes(1);
});
it("replaces the cover again on every retry, since no Idempotency-Key applies", async () => {
  await uploadTripCoverImage(actor, tripId, {}, gif());
  await uploadTripCoverImage(actor, tripId, {}, gif());
  expect(mocks.put).toHaveBeenCalledTimes(2);
  expect(mocks.update).toHaveBeenCalledTimes(2);
});
it.each([{ extra: true }, "nope"])("validates the body and trip id before access or storage", async (input) => {
  await expect(uploadTripCoverImage(actor, tripId, input, gif())).rejects.toThrow();
  await expect(uploadTripCoverImage(actor, "bad", {}, gif())).rejects.toThrow();
  expect(mocks.role).not.toHaveBeenCalled();
  expect(mocks.put).not.toHaveBeenCalled();
});
