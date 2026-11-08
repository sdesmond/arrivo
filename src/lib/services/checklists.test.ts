import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn(),
  lockTripForUpdate: vi.fn(),
  requireTripRole: vi.fn(),
  afterTripWrite: vi.fn(),
}));
vi.mock("@/db", () => ({ db: mocks }));
vi.mock("@/lib/server-action-locks", () => ({
  lockTripForUpdate: mocks.lockTripForUpdate,
  TRIP_NOT_FOUND_MESSAGE: "Trip not found.",
}));
vi.mock("./trip-access", async (original) => ({
  ...(await original<typeof import("./trip-access")>()),
  requireTripRole: mocks.requireTripRole,
}));
vi.mock("./trip-write-effects", () => ({ afterTripWrite: mocks.afterTripWrite }));
import { updateChecklistItem } from "./checklists";
const itemId = "123e4567-e89b-12d3-a456-426614174000";
const row = { id: itemId, checklistId: "list", content: "Pack", isChecked: true, createdAt: null };
let ancestry: { tripId: string }[];
let returned: (typeof row)[];
beforeEach(() => {
  vi.clearAllMocks();
  ancestry = [{ tripId: "trip" }];
  returned = [row];
  mocks.select.mockReturnValue({
    from: () => ({ innerJoin: () => ({ innerJoin: () => ({ where: async () => ancestry }) }) }),
  });
  mocks.update.mockReturnValue({ set: vi.fn(() => ({ where: () => ({ returning: async () => returned }) })) });
  mocks.transaction.mockImplementation(async (callback) => callback(mocks));
});
it.each([true, false])("writes absolute value %s after locking and rechecking", async (isChecked) => {
  await expect(updateChecklistItem({ userId: "user" }, itemId, { isChecked })).resolves.toMatchObject({ id: itemId });
  expect(mocks.update().set).toHaveBeenCalledWith({ isChecked });
  expect(mocks.lockTripForUpdate).toHaveBeenCalledWith(mocks, "trip");
  expect(mocks.requireTripRole).toHaveBeenCalledWith("trip", "user", "editor", mocks);
  expect(mocks.afterTripWrite).toHaveBeenCalledWith({ userId: "user" }, "trip");
});
it("rejects invalid input before DB access", async () => {
  await expect(updateChecklistItem({ userId: "user" }, itemId, { isChecked: "yes" })).rejects.toThrow();
  expect(mocks.select).not.toHaveBeenCalled();
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});
it("conceals missing ancestry and skips effects on failure", async () => {
  ancestry = [];
  await expect(updateChecklistItem({ userId: "user" }, itemId, { isChecked: true })).rejects.toThrow();
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});
it("rejects ancestry removed during locking", async () => {
  mocks.lockTripForUpdate.mockImplementationOnce(async () => {
    ancestry = [];
  });
  await expect(updateChecklistItem({ userId: "user" }, itemId, { isChecked: true })).rejects.toThrow();
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});
it("skips effects for failed access or deleted result", async () => {
  mocks.requireTripRole.mockRejectedValueOnce(new Error("denied"));
  await expect(updateChecklistItem({ userId: "user" }, itemId, { isChecked: true })).rejects.toThrow("denied");
  returned = [];
  await expect(updateChecklistItem({ userId: "user" }, itemId, { isChecked: false })).rejects.toThrow();
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});

it("maps a trip deleted before lock acquisition to not found", async () => {
  mocks.lockTripForUpdate.mockRejectedValueOnce(new Error("Trip not found."));
  await expect(updateChecklistItem({ userId: "user" }, itemId, { isChecked: true })).rejects.toMatchObject({
    name: "TripNotFoundError",
  });
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});
it("propagates unexpected lock failures without side effects", async () => {
  mocks.lockTripForUpdate.mockRejectedValueOnce(new Error("database unavailable"));
  await expect(updateChecklistItem({ userId: "user" }, itemId, { isChecked: true })).rejects.toThrow(
    "database unavailable"
  );
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});
it("rejects changed ancestry instead of writing another trip", async () => {
  mocks.lockTripForUpdate.mockImplementationOnce(async () => {
    ancestry = [{ tripId: "other" }];
  });
  await expect(updateChecklistItem({ userId: "user" }, itemId, { isChecked: true })).rejects.toMatchObject({
    name: "TripNotFoundError",
  });
  expect(mocks.update).not.toHaveBeenCalled();
});

it.each(["viewer", "stranger"])("denies known %s before transaction or exclusive lock", async () => {
  mocks.requireTripRole.mockRejectedValueOnce(new Error("denied"));
  await expect(updateChecklistItem({ userId: "user" }, itemId, { isChecked: true })).rejects.toThrow("denied");
  expect(mocks.transaction).not.toHaveBeenCalled();
  expect(mocks.lockTripForUpdate).not.toHaveBeenCalled();
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});
it("rechecks access inside the lock after a successful precheck", async () => {
  mocks.requireTripRole.mockResolvedValueOnce("editor").mockRejectedValueOnce(new Error("revoked"));
  await expect(updateChecklistItem({ userId: "user" }, itemId, { isChecked: true })).rejects.toThrow("revoked");
  expect(mocks.requireTripRole).toHaveBeenNthCalledWith(1, "trip", "user", "editor");
  expect(mocks.requireTripRole).toHaveBeenNthCalledWith(2, "trip", "user", "editor", mocks);
  expect(mocks.update).not.toHaveBeenCalled();
});
it("defers effects until the transaction commit resolves", async () => {
  let commit: () => void = () => {
    throw new Error("commit not ready");
  };
  let signalReady: () => void = () => {};
  const ready = new Promise<void>((resolve) => {
    signalReady = resolve;
  });
  mocks.transaction.mockImplementationOnce(async (callback) => {
    const result = await callback(mocks);
    await new Promise<void>((resolve) => {
      commit = resolve;
      signalReady();
    });
    return result;
  });
  const pending = updateChecklistItem({ userId: "user" }, itemId, { isChecked: true });
  await ready;
  expect(mocks.update).toHaveBeenCalled();
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
  commit();
  await pending;
  expect(mocks.afterTripWrite).toHaveBeenCalledOnce();
});
it("skips effects when commit rejects after a successful update", async () => {
  mocks.transaction.mockImplementationOnce(async (callback) => {
    await callback(mocks);
    throw new Error("commit rejected");
  });
  await expect(updateChecklistItem({ userId: "user" }, itemId, { isChecked: true })).rejects.toThrow("commit rejected");
  expect(mocks.update).toHaveBeenCalled();
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});
