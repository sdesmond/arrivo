import { expect, it, vi } from "vitest";
const { create, list, apiRoute } = vi.hoisted(() => ({
  create: vi.fn(),
  list: vi.fn(),
  apiRoute: vi.fn((...args: [unknown, (input: unknown) => unknown, unknown?]) => args[1]),
}));
vi.mock("@/lib/services/packing-templates", () => ({ createPackingTemplate: create, listPackingTemplates: list }));
vi.mock("@/lib/api/route", () => ({ apiRoute }));
import { GET, POST } from "./route";
import { createPackingTemplate, listPackingTemplates } from "@/lib/api/contract/packing-templates";

it("registers the idempotent create route and forwards the replay", async () => {
  expect(apiRoute.mock.calls.find((call) => call[0] === createPackingTemplate)?.[2]).toEqual({ idempotent: {} });
  const actor = { userId: "user" };
  const replay = { key: "retry", method: "POST", path: "/api/v1/packing-templates" };
  const body = { id: "t", name: "Beach" };
  await (POST as unknown as (input: unknown) => Promise<unknown>)({ actor, params: {}, body, replay });
  expect(create).toHaveBeenCalledWith(actor, body, replay);
});

it("registers the list route without idempotency", async () => {
  expect(apiRoute.mock.calls.find((call) => call[0] === listPackingTemplates)?.[2]).toBeUndefined();
  const actor = { userId: "user" };
  await (GET as unknown as (input: unknown) => Promise<unknown>)({ actor, params: {}, body: {} });
  expect(list).toHaveBeenCalledWith(actor, {});
});
