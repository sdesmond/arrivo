import { expect, it, vi } from "vitest";
const { create, apiRoute } = vi.hoisted(() => ({
  create: vi.fn(),
  apiRoute: vi.fn((...args: [unknown, (input: unknown) => unknown, unknown?]) => args[1]),
}));
vi.mock("@/lib/services/itinerary-notes", () => ({ createDayNote: create }));
vi.mock("@/lib/api/route", () => ({ apiRoute }));
import { POST } from "./route";
import { createDayNote } from "@/lib/api/contract/itinerary-notes";
const handler = POST as unknown as (input: unknown) => Promise<unknown>;

it("registers POST with its create contract and Idempotency-Key support", () => {
  expect(apiRoute.mock.calls[0][0]).toBe(createDayNote);
  expect(apiRoute.mock.calls[0][1]).toBe(POST);
  expect(apiRoute.mock.calls[0][2]).toEqual({ idempotent: {} });
});

it("adapts the validated actor, day and body to the service, with replay metadata", async () => {
  const replay = { key: "retry-1", method: "POST", path: "/api/v1/days/day/notes" };
  const input = { actor: { userId: "user" }, params: { dayId: "day" }, body: { content: "Tickets" }, replay };
  create.mockResolvedValue({ id: "note" });
  await expect(handler(input)).resolves.toEqual({ id: "note" });
  expect(create).toHaveBeenCalledWith(input.actor, "day", { content: "Tickets" }, replay);
});

it("passes no replay when the request has no key", async () => {
  const input = { actor: { userId: "user" }, params: { dayId: "day" }, body: { content: "Tickets" } };
  create.mockResolvedValue({ id: "note" });
  await handler(input);
  expect(create).toHaveBeenLastCalledWith(input.actor, "day", { content: "Tickets" }, undefined);
});
