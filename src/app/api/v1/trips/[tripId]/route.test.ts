import { expect, it, vi } from "vitest";
const { update, read, remove, apiRoute } = vi.hoisted(() => ({
  update: vi.fn(),
  read: vi.fn(),
  remove: vi.fn(),
  apiRoute: vi.fn((...args: [unknown, (input: unknown) => unknown, unknown?]) => args[1]),
}));
vi.mock("@/lib/services/trips", () => ({ updateTrip: update, getTrip: read, deleteTrip: remove }));
vi.mock("@/lib/api/route", () => ({ apiRoute }));
import { DELETE, GET, PATCH } from "./route";
import { deleteTrip, getTrip, updateTrip } from "@/lib/api/contract/trips";
it("registers the idempotent route and forwards the request", async () => {
  expect(apiRoute.mock.calls.find((call) => call[0] === updateTrip)?.[2]).toEqual({ idempotent: {} });
  const actor = { userId: "user" };
  const replay = { key: "retry", method: "PATCH", path: "/test" };
  const body = { name: "Trip" };
  await (PATCH as unknown as (input: unknown) => Promise<unknown>)({ actor, params: { tripId: "trip" }, body, replay });
  expect(update).toHaveBeenCalledWith(actor, "trip", body, replay);
});

it("registers the snapshot route with an ETag and forwards the request", async () => {
  expect(apiRoute.mock.calls.find((call) => call[0] === getTrip)?.[2]).toEqual({ etag: true });
  const actor = { userId: "user" };
  await (GET as unknown as (input: unknown) => Promise<unknown>)({ actor, params: { tripId: "trip" } });
  expect(read).toHaveBeenCalledWith(actor, "trip");
});

it("registers idempotent deletion and forwards the request", async () => {
  expect(apiRoute.mock.calls.find((call) => call[0] === deleteTrip)?.[2]).toEqual({ idempotent: {} });
  const actor = { userId: "user" };
  const replay = { key: "retry", method: "DELETE", path: "/test" };
  await (DELETE as unknown as (input: unknown) => Promise<unknown>)({
    actor,
    params: { tripId: "trip" },
    body: {},
    replay,
  });
  expect(remove).toHaveBeenCalledWith(actor, "trip", {}, replay);
});
