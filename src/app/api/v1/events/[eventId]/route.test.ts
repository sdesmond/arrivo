import { expect, it, vi } from "vitest";
const { update, apiRoute } = vi.hoisted(() => ({
  update: vi.fn(),
  apiRoute: vi.fn((...args: [unknown, (input: unknown) => unknown, unknown?]) => args[1]),
}));
vi.mock("@/lib/services/events", () => ({ updateEvent: update }));
vi.mock("@/lib/api/route", () => ({ apiRoute }));
import { PATCH } from "./route";
import { updateEvent } from "@/lib/api/contract/events";
const handler = PATCH as unknown as (input: unknown) => Promise<unknown>;

it("registers PATCH with its partial-update contract and Idempotency-Key support", () => {
  expect(apiRoute.mock.calls[0][0]).toBe(updateEvent);
  expect(apiRoute.mock.calls[0][1]).toBe(PATCH);
  expect(apiRoute.mock.calls[0][2]).toEqual({ idempotent: {} });
});

it("adapts the validated actor, id and body to the service", async () => {
  const input = { actor: { userId: "user" }, params: { eventId: "event" }, body: { note: null } };
  update.mockResolvedValue({ id: "event" });
  await expect(handler(input)).resolves.toEqual({ id: "event" });
  expect(update).toHaveBeenCalledWith(input.actor, "event", { note: null }, undefined);
});

it("forwards replay metadata to the service", async () => {
  const replay = { key: "retry-1", method: "PATCH", path: "/api/v1/events/event" };
  const input = { actor: { userId: "user" }, params: { eventId: "event" }, body: { name: "x" }, replay };
  update.mockResolvedValue({ id: "event" });
  await handler(input);
  expect(update).toHaveBeenLastCalledWith(input.actor, "event", { name: "x" }, replay);
});
