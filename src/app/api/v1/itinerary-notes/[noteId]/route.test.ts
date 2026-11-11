import { expect, it, vi } from "vitest";
const { update, remove, apiRoute } = vi.hoisted(() => ({
  update: vi.fn(),
  remove: vi.fn(),
  apiRoute: vi.fn((...args: [unknown, (input: unknown) => unknown, unknown?]) => args[1]),
}));
vi.mock("@/lib/services/itinerary-notes", () => ({ updateDayNote: update, deleteDayNote: remove }));
vi.mock("@/lib/api/route", () => ({ apiRoute }));
import { PATCH, DELETE } from "./route";
import { updateDayNote, deleteDayNote } from "@/lib/api/contract/itinerary-notes";
const handler = PATCH as unknown as (input: unknown) => Promise<unknown>;
const deleteHandler = DELETE as unknown as (input: unknown) => Promise<unknown>;

it("registers PATCH with its update contract and Idempotency-Key support", () => {
  expect(apiRoute.mock.calls[0][0]).toBe(updateDayNote);
  expect(apiRoute.mock.calls[0][1]).toBe(PATCH);
  expect(apiRoute.mock.calls[0][2]).toEqual({ idempotent: {} });
});

it("registers DELETE with its deletion contract and Idempotency-Key support", () => {
  expect(apiRoute.mock.calls[1][0]).toBe(deleteDayNote);
  expect(apiRoute.mock.calls[1][1]).toBe(DELETE);
  expect(apiRoute.mock.calls[1][2]).toEqual({ idempotent: {} });
});

it("adapts the validated actor, id and body to the service", async () => {
  const input = { actor: { userId: "user" }, params: { noteId: "note" }, body: { content: "Tickets" } };
  update.mockResolvedValue({ id: "note" });
  await expect(handler(input)).resolves.toEqual({ id: "note" });
  expect(update).toHaveBeenCalledWith(input.actor, "note", { content: "Tickets" }, undefined);
});

it("forwards replay metadata to the service", async () => {
  const replay = { key: "retry-1", method: "PATCH", path: "/api/v1/itinerary-notes/note" };
  const input = { actor: { userId: "user" }, params: { noteId: "note" }, body: { content: "x" }, replay };
  update.mockResolvedValue({ id: "note" });
  await handler(input);
  expect(update).toHaveBeenLastCalledWith(input.actor, "note", { content: "x" }, replay);
});

it("forwards DELETE with actor, note, body and replay", async () => {
  const replay = { key: "retry-2", method: "DELETE", path: "/api/v1/itinerary-notes/note" };
  const input = { actor: { userId: "user" }, params: { noteId: "note" }, body: { tripId: "trip" }, replay };
  remove.mockResolvedValue(null);
  await expect(deleteHandler(input)).resolves.toBeNull();
  expect(remove).toHaveBeenCalledWith(input.actor, "note", input.body, replay);
});
