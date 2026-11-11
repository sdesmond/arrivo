import { expect, it, vi } from "vitest";
const { update, remove, apiRoute } = vi.hoisted(() => ({
  update: vi.fn(),
  remove: vi.fn(),
  apiRoute: vi.fn((...args: [unknown, (input: unknown) => unknown, unknown?]) => args[1]),
}));
vi.mock("@/lib/services/days", () => ({ updateDay: update, deleteDay: remove }));
vi.mock("@/lib/api/route", () => ({ apiRoute }));
import { PATCH, DELETE } from "./route";
import { updateDay, deleteDay } from "@/lib/api/contract/days";
const handler = PATCH as unknown as (input: unknown) => Promise<unknown>;
const deleteHandler = DELETE as unknown as (input: unknown) => Promise<unknown>;

it("registers PATCH with its partial-update contract and Idempotency-Key opted in", () => {
  expect(apiRoute.mock.calls[0][0]).toBe(updateDay);
  expect(apiRoute.mock.calls[0][1]).toBe(PATCH);
  expect(apiRoute.mock.calls[0][2]).toEqual({ idempotent: {} });
});

it("registers DELETE with its deletion contract and Idempotency-Key opted in", () => {
  expect(apiRoute.mock.calls[1][0]).toBe(deleteDay);
  expect(apiRoute.mock.calls[1][1]).toBe(DELETE);
  expect(apiRoute.mock.calls[1][2]).toEqual({ idempotent: {} });
});

it("forwards PATCH actor, day, body and replay to the service", async () => {
  const replay = { key: "retry-1", method: "PATCH", path: "/api/v1/days/day" };
  const input = { actor: { userId: "user" }, params: { dayId: "day" }, body: { subtitle: null }, replay };
  update.mockResolvedValue({ id: "day" });
  await expect(handler(input)).resolves.toEqual({ id: "day" });
  expect(update).toHaveBeenCalledWith(input.actor, "day", { subtitle: null }, replay);
});

it("forwards DELETE actor, day, body and replay to the service", async () => {
  const replay = { key: "retry-2", method: "DELETE", path: "/api/v1/days/day" };
  const input = {
    actor: { userId: "user" },
    params: { dayId: "day" },
    body: { tripId: "trip", confirmDestructive: true },
    replay,
  };
  remove.mockResolvedValue(null);
  await expect(deleteHandler(input)).resolves.toBeNull();
  expect(remove).toHaveBeenCalledWith(input.actor, "day", input.body, replay);
});
