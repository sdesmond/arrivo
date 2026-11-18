import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  service: vi.fn(),
  apiRoute: vi.fn((...args: [unknown, (input: unknown) => unknown, unknown?]) => args[1]),
}));
vi.mock("@/lib/services/sharing", () => ({ leaveTrip: mocks.service }));
vi.mock("@/lib/api/route", () => ({ apiRoute: mocks.apiRoute }));
import { DELETE } from "./route";
import { leaveTrip } from "@/lib/api/contract/sharing";
it("registers an idempotent self-departure route and forwards actor, trip and replay", async () => {
  expect(mocks.apiRoute.mock.calls[0][0]).toBe(leaveTrip);
  expect(mocks.apiRoute.mock.calls[0][2]).toEqual({ idempotent: {} });
  const replay = { key: "key", method: "DELETE", path: "/p" };
  const input = { actor: { userId: "user" }, params: { tripId: "trip" }, body: {}, replay };
  mocks.service.mockResolvedValue(null);
  await (DELETE as unknown as (input: unknown) => Promise<unknown>)(input);
  expect(mocks.service).toHaveBeenCalledWith(input.actor, "trip", replay);
});
