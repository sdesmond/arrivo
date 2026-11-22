import { expect, it, vi } from "vitest";
const { save, apiRoute } = vi.hoisted(() => ({
  save: vi.fn(),
  apiRoute: vi.fn((...args: [unknown, (input: unknown) => unknown, unknown?]) => args[1]),
}));
vi.mock("@/lib/services/packing-templates", () => ({ savePackingListAsTemplate: save }));
vi.mock("@/lib/api/route", () => ({ apiRoute }));
import { POST } from "./route";
import { savePackingListAsTemplate } from "@/lib/api/contract/packing-templates";
it("registers an idempotent route and forwards the validated request and replay", async () => {
  expect(apiRoute.mock.calls.find((call) => call[0] === savePackingListAsTemplate)?.[2]).toEqual({ idempotent: {} });
  const replay = { key: "retry", method: "POST", path: "/test" };
  const actor = { userId: "user" };
  const body = { tripId: "trip", id: "template", name: "Beach" };
  await (POST as unknown as (input: unknown) => Promise<unknown>)({ actor, params: { listId: "list" }, body, replay });
  expect(save).toHaveBeenCalledWith(actor, "list", body, replay);
});
