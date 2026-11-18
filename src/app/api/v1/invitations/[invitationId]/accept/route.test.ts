import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  service: vi.fn(),
  apiRoute: vi.fn((...args: [unknown, (input: unknown) => unknown, unknown?]) => args[1]),
}));
vi.mock("@/lib/services/sharing", () => ({ acceptInvitation: mocks.service }));
vi.mock("@/lib/api/route", () => ({ apiRoute: mocks.apiRoute }));
import { POST } from "./route";
import { acceptInvitation } from "@/lib/api/contract/sharing";
it("registers the contract as an idempotent route", () => {
  expect(mocks.apiRoute.mock.calls[0][0]).toBe(acceptInvitation);
  expect(mocks.apiRoute.mock.calls[0][1]).toBe(POST);
  expect(mocks.apiRoute.mock.calls[0][2]).toEqual({ idempotent: {} });
});
it("forwards the actor, invitation id and replay request to the sharing service", async () => {
  const replay = { key: "key", method: "POST", path: "/p" };
  const input = { actor: { userId: "user" }, params: { invitationId: "invite" }, body: {}, replay };
  mocks.service.mockResolvedValue({ status: "x" });
  await expect((POST as unknown as (input: unknown) => Promise<unknown>)(input)).resolves.toEqual({ status: "x" });
  expect(mocks.service).toHaveBeenCalledWith(input.actor, "invite", replay);
});
