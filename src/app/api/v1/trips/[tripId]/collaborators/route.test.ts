import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  service: vi.fn(),
  apiRoute: vi.fn((...args: [unknown, (input: unknown) => unknown, unknown?]) => args[1]),
}));
vi.mock("@/lib/services/sharing", () => ({ getCollaborators: mocks.service }));
vi.mock("@/lib/api/route", () => ({ apiRoute: mocks.apiRoute }));
import { GET } from "./route";
import { getCollaborators } from "@/lib/api/contract/sharing";
it("registers contract through shared route wrapper", () => {
  expect(mocks.apiRoute.mock.calls[0][0]).toBe(getCollaborators);
  expect(mocks.apiRoute.mock.calls[0][1]).toBe(GET);
});
it("forwards validated request to sharing service", async () => {
  const input = {
    actor: { userId: "user" },
    params: { tripId: "trip" },
    body: { tripId: "trip", username: "alice" },
    replay: undefined,
  };
  mocks.service.mockResolvedValue({ status: "invited" });
  await expect((GET as unknown as (input: unknown) => Promise<unknown>)(input)).resolves.toEqual({ status: "invited" });
  expect(mocks.service).toHaveBeenCalledWith(input.actor, "trip");
});
