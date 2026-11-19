import { expect, it, vi } from "vitest";
const { create, apiRoute } = vi.hoisted(() => ({
  create: vi.fn(),
  apiRoute: vi.fn((...args: [unknown, (input: unknown) => unknown, unknown?]) => args[1]),
}));
vi.mock("@/lib/services/packing", () => ({ createPackingItem: create }));
vi.mock("@/lib/api/route", () => ({ apiRoute }));
import { POST } from "./route";
import { createPackingItem } from "@/lib/api/contract/packing";
it("registers an idempotent create and forwards the request", async () => {
  expect(apiRoute.mock.calls[0][0]).toBe(createPackingItem);
  expect(apiRoute.mock.calls[0][2]).toEqual({ idempotent: {} });
  const input = {
    actor: { userId: "user" },
    params: { tripId: "trip" },
    body: { id: "item" },
    replay: { key: "retry" },
  };
  await (POST as unknown as (input: unknown) => Promise<unknown>)(input);
  expect(create).toHaveBeenCalledWith(input.actor, "trip", input.body, input.replay);
});
