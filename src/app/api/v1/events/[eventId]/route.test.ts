import { expect, it, vi } from "vitest";
const { update, remove, apiRoute } = vi.hoisted(() => ({
  update: vi.fn(),
  remove: vi.fn(),
  apiRoute: vi.fn((...args: [unknown, (input: unknown) => unknown, unknown?]) => args[1]),
}));
vi.mock("@/lib/services/events", () => ({ updateEvent: update, deleteEvent: remove }));
vi.mock("@/lib/api/route", () => ({ apiRoute }));
import { PATCH, DELETE } from "./route";
import { updateEvent, deleteEvent } from "@/lib/api/contract/events";
const handler = PATCH as unknown as (input: unknown) => Promise<unknown>;
const deleteHandler = DELETE as unknown as (input: unknown) => Promise<unknown>;

it("registers PATCH with its partial-update contract and Idempotency-Key support", () => {
  expect(apiRoute.mock.calls[0][0]).toBe(updateEvent);
  expect(apiRoute.mock.calls[0][1]).toBe(PATCH);
  expect(apiRoute.mock.calls[0][2]).toEqual({ idempotent: {} });
});

it("registers DELETE with its deletion contract and Idempotency-Key support", () => {
  expect(apiRoute.mock.calls[1][0]).toBe(deleteEvent);
  expect(apiRoute.mock.calls[1][1]).toBe(DELETE);
  expect(apiRoute.mock.calls[1][2]).toEqual({ idempotent: {} });
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

it("forwards DELETE with actor, event, body and replay", async () => {
  const replay = { key: "retry-2", method: "DELETE", path: "/api/v1/events/event" };
  const input = {
    actor: { userId: "user" },
    params: { eventId: "event" },
    body: { tripId: "trip", keepDocuments: true },
    replay,
  };
  remove.mockResolvedValue(null);
  await expect(deleteHandler(input)).resolves.toBeNull();
  expect(remove).toHaveBeenCalledWith(input.actor, "event", input.body, replay);
});
