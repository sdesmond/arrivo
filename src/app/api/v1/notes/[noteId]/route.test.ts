import { expect, it, vi } from "vitest";
const { update, remove, apiRoute } = vi.hoisted(() => ({
  update: vi.fn(),
  remove: vi.fn(),
  apiRoute: vi.fn((...args: [unknown, (input: unknown) => unknown, unknown?]) => args[1]),
}));
vi.mock("@/lib/services/trip-notes", () => ({ updateTripNote: update, deleteTripNote: remove }));
vi.mock("@/lib/api/route", () => ({ apiRoute }));
import { DELETE, PATCH } from "./route";
import { deleteTripNote, updateTripNote } from "@/lib/api/contract/trip-notes";
it("registers PATCH and DELETE with their contracts and Idempotency-Key opted in", () => {
  expect(apiRoute.mock.calls[0][0]).toBe(updateTripNote);
  expect(apiRoute.mock.calls[0][1]).toBe(PATCH);
  expect(apiRoute.mock.calls[0][2]).toEqual({ idempotent: {} });
  expect(apiRoute.mock.calls[1][0]).toBe(deleteTripNote);
  expect(apiRoute.mock.calls[1][1]).toBe(DELETE);
  expect(apiRoute.mock.calls[1][2]).toEqual({ idempotent: {} });
});
it("forwards actor, note, body and replay to the update service", async () => {
  const input = {
    actor: { userId: "user" },
    params: { noteId: "note" },
    body: { title: "Packing" },
    replay: { key: "retry", method: "PATCH", path: "/api/v1/notes/note" },
  };
  update.mockResolvedValue({ id: "note" });
  await expect((PATCH as unknown as (input: unknown) => Promise<unknown>)(input)).resolves.toEqual({ id: "note" });
  expect(update).toHaveBeenCalledWith(input.actor, "note", input.body, input.replay);
});
it("forwards actor, note, body and replay to the delete service", async () => {
  const input = {
    actor: { userId: "user" },
    params: { noteId: "note" },
    body: { tripId: "trip" },
    replay: { key: "retry", method: "DELETE", path: "/api/v1/notes/note" },
  };
  remove.mockResolvedValue(null);
  await expect((DELETE as unknown as (input: unknown) => Promise<unknown>)(input)).resolves.toBeNull();
  expect(remove).toHaveBeenCalledWith(input.actor, "note", input.body, input.replay);
});
