import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  service: vi.fn(),
  save: vi.fn(),
  apiRoute: vi.fn((...args: [unknown, (input: unknown) => unknown, unknown?]) => args[1]),
}));
vi.mock("@/lib/services/sharing", () => ({ getCollaborators: mocks.service, saveContributorChanges: mocks.save }));
vi.mock("@/lib/api/route", () => ({ apiRoute: mocks.apiRoute }));
import { GET, PATCH } from "./route";
import { getCollaborators, saveContributorChanges } from "@/lib/api/contract/sharing";
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
it("registers the contributor batch as an idempotent PATCH", () => {
  expect(mocks.apiRoute.mock.calls[1][0]).toBe(saveContributorChanges);
  expect(mocks.apiRoute.mock.calls[1][1]).toBe(PATCH);
  expect(mocks.apiRoute.mock.calls[1][2]).toEqual({ idempotent: {} });
});
it("forwards the contributor batch and replay metadata to the sharing service", async () => {
  const replay = { key: "key", method: "PATCH", path: "/api/v1/trips/trip/collaborators" };
  const input = {
    actor: { userId: "user" },
    params: { tripId: "trip" },
    body: { changes: [{ type: "remove", collaboratorId: "collab" }] },
    replay,
  };
  mocks.save.mockResolvedValue({ status: "success" });
  await expect((PATCH as unknown as (input: unknown) => Promise<unknown>)(input)).resolves.toEqual({
    status: "success",
  });
  expect(mocks.save).toHaveBeenCalledWith(input.actor, "trip", input.body, replay);
});
