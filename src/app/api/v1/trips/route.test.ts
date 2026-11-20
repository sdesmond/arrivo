import { expect, it, vi } from "vitest";
const { create, list, apiRoute, readHeaders } = vi.hoisted(() => ({
  create: vi.fn(),
  list: vi.fn(),
  apiRoute: vi.fn((...args: [unknown, (input: unknown) => unknown, unknown?]) => args[1]),
  readHeaders: vi.fn(),
}));
vi.mock("@/lib/services/trips", () => ({ createTrip: create, listTrips: list }));
vi.mock("@/lib/api/route", () => ({ apiRoute }));
vi.mock("next/headers", () => ({ headers: readHeaders }));
import { GET, POST } from "./route";
import { createTrip, listTrips } from "@/lib/api/contract/trips";

it("registers the idempotent create route and passes the locale as an option", async () => {
  expect(apiRoute.mock.calls.find((call) => call[0] === createTrip)?.[2]).toEqual({ idempotent: {} });
  readHeaders.mockResolvedValue(new Headers({ "accept-language": "en-GB" }));
  const actor = { userId: "user" };
  const replay = { key: "retry", method: "POST", path: "/api/v1/trips" };
  const body = { id: "trip", name: "Trip" };
  await (POST as unknown as (input: unknown) => Promise<unknown>)({ actor, params: {}, body, replay });
  expect(create).toHaveBeenCalledWith(actor, body, replay, { acceptLanguage: "en-GB" });
});

it("passes an empty locale when the header is absent", async () => {
  readHeaders.mockResolvedValue(new Headers());
  const actor = { userId: "user" };
  await (POST as unknown as (input: unknown) => Promise<unknown>)({ actor, params: {}, body: { id: "t" } });
  expect(create).toHaveBeenLastCalledWith(actor, { id: "t" }, undefined, { acceptLanguage: "" });
});

it("registers the list route without idempotency and forwards the request", async () => {
  expect(apiRoute.mock.calls.find((call) => call[0] === listTrips)?.[2]).toBeUndefined();
  const actor = { userId: "user" };
  await (GET as unknown as (input: unknown) => Promise<unknown>)({ actor, params: {}, body: {} });
  expect(list).toHaveBeenCalledWith(actor, {});
});
