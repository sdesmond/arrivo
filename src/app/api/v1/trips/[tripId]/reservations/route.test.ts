import { expect, it, vi } from "vitest";
const { list, create, apiRoute } = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  apiRoute: vi.fn((...args: [unknown, (input: unknown) => unknown, unknown?]) => args[1]),
}));
vi.mock("@/lib/services/reservations", () => ({ listReservations: list, createReservation: create }));
vi.mock("@/lib/api/route", () => ({ apiRoute }));
import { GET, POST } from "./route";
import { createReservation, listReservations } from "@/lib/api/contract/reservations";

it("registers GET and idempotent POST and forwards their inputs", async () => {
  expect(apiRoute.mock.calls[0][0]).toBe(listReservations);
  expect(apiRoute.mock.calls[1][0]).toBe(createReservation);
  expect(apiRoute.mock.calls[1][2]).toEqual({ idempotent: {} });
  const input = {
    actor: { userId: "user" },
    params: { tripId: "trip" },
    body: { id: "reservation" },
    replay: { key: "retry" },
  };
  await (GET as unknown as (input: unknown) => Promise<unknown>)(input);
  await (POST as unknown as (input: unknown) => Promise<unknown>)(input);
  expect(list).toHaveBeenCalledWith(input.actor, "trip", input.body);
  expect(create).toHaveBeenCalledWith(input.actor, "trip", input.body, input.replay);
});
