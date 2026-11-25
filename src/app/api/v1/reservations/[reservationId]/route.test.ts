import { expect, it, vi } from "vitest";
const { read, update, remove, apiRoute } = vi.hoisted(() => ({
  read: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  apiRoute: vi.fn((...args: [unknown, (input: unknown) => unknown, unknown?]) => args[1]),
}));
vi.mock("@/lib/services/reservations", () => ({
  getReservation: read,
  updateReservation: update,
  deleteReservation: remove,
}));
vi.mock("@/lib/api/route", () => ({ apiRoute }));
import { DELETE, GET, PATCH } from "./route";
import { deleteReservation, getReservation, updateReservation } from "@/lib/api/contract/reservations";

it("registers GET and idempotent PATCH and forwards their inputs", async () => {
  expect(apiRoute.mock.calls[0][0]).toBe(getReservation);
  expect(apiRoute.mock.calls[1][0]).toBe(updateReservation);
  expect(apiRoute.mock.calls[1][2]).toEqual({ idempotent: {} });
  expect(apiRoute.mock.calls[2][0]).toBe(deleteReservation);
  const input = {
    actor: { userId: "user" },
    params: { reservationId: "reservation" },
    body: { notes: null },
    replay: { key: "retry" },
  };
  await (GET as unknown as (input: unknown) => Promise<unknown>)(input);
  await (PATCH as unknown as (input: unknown) => Promise<unknown>)(input);
  await (DELETE as unknown as (input: unknown) => Promise<unknown>)(input);
  expect(remove).toHaveBeenCalledWith(input.actor, "reservation", input.body);
  expect(read).toHaveBeenCalledWith(input.actor, "reservation", input.body);
  expect(update).toHaveBeenCalledWith(input.actor, "reservation", input.body, input.replay);
});
