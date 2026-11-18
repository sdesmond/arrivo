import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  service: vi.fn(),
  apiRoute: vi.fn((...args: [unknown, (input: unknown) => unknown, unknown?]) => args[1]),
}));
vi.mock("@/lib/services/sharing", () => ({ rescindInvitation: mocks.service }));
vi.mock("@/lib/api/route", () => ({ apiRoute: mocks.apiRoute }));
import { DELETE } from "./route";
import { rescindInvitation } from "@/lib/api/contract/sharing";
it("registers idempotent route and forwards trip, invitation and replay", async () => {
  expect(mocks.apiRoute.mock.calls[0][0]).toBe(rescindInvitation);
  expect(mocks.apiRoute.mock.calls[0][2]).toEqual({ idempotent: {} });
  const replay = { key: "key", method: "DELETE", path: "/p" };
  const input = {
    actor: { userId: "user" },
    params: { invitationId: "invite", tripId: "trip" },
    body: { tripId: "trip" },
    replay,
  };
  mocks.service.mockResolvedValue({ status: "success" });
  await (DELETE as unknown as (input: unknown) => Promise<unknown>)(input);
  expect(mocks.service).toHaveBeenCalledWith(input.actor, "trip", "invite", replay);
});
