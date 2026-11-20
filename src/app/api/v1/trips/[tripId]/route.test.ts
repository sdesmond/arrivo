import { expect, it, vi } from "vitest";
const { update, apiRoute } = vi.hoisted(() => ({
  update: vi.fn(),
  apiRoute: vi.fn((...args: [unknown, (input: unknown) => unknown, unknown?]) => args[1]),
}));
vi.mock("@/lib/services/trips", () => ({ updateTrip: update }));
vi.mock("@/lib/api/route", () => ({ apiRoute }));
import { PATCH } from "./route";
import { updateTrip } from "@/lib/api/contract/trips";
it("registers the idempotent route and forwards the request", async () => {
  expect(apiRoute.mock.calls.find((call) => call[0] === updateTrip)?.[2]).toEqual({ idempotent: {} });
  const actor = { userId: "user" };
  const replay = { key: "retry", method: "PATCH", path: "/test" };
  const body = { name: "Trip" };
  await (PATCH as unknown as (input: unknown) => Promise<unknown>)({ actor, params: { tripId: "trip" }, body, replay });
  expect(update).toHaveBeenCalledWith(actor, "trip", body, replay);
});
