import { expect, it, vi } from "vitest";
const { update, remove, apiRoute } = vi.hoisted(() => ({
  update: vi.fn(),
  remove: vi.fn(),
  apiRoute: vi.fn((...args: [unknown, (input: unknown) => unknown, unknown?]) => args[1]),
}));
vi.mock("@/lib/services/documents", () => ({ updateDocument: update, removeDocument: remove }));
vi.mock("@/lib/api/route", () => ({ apiRoute }));
import { PATCH, DELETE } from "./route";
import { updateDocument as renameDocument, deleteDocument as removeDocument } from "@/lib/api/contract/documents";
const handler = PATCH as unknown as (input: unknown) => Promise<unknown>;
const deleteHandler = DELETE as unknown as (input: unknown) => Promise<unknown>;

it("registers PATCH with its partial-update contract and Idempotency-Key support", () => {
  expect(apiRoute.mock.calls[0][0]).toBe(renameDocument);
  expect(apiRoute.mock.calls[0][1]).toBe(PATCH);
  expect(apiRoute.mock.calls[0][2]).toEqual({ idempotent: {} });
});

it("registers DELETE with its deletion contract and Idempotency-Key support", () => {
  expect(apiRoute.mock.calls[1][0]).toBe(removeDocument);
  expect(apiRoute.mock.calls[1][1]).toBe(DELETE);
  expect(apiRoute.mock.calls[1][2]).toEqual({ idempotent: {} });
});

it("adapts the validated actor, id and body to the service", async () => {
  const input = { actor: { userId: "user" }, params: { documentId: "document" }, body: { name: "new" } };
  update.mockResolvedValue({ id: "document" });
  await expect(handler(input)).resolves.toEqual({ id: "document" });
  expect(update).toHaveBeenCalledWith(input.actor, "document", { name: "new" }, undefined);
});

it("forwards replay metadata to the service", async () => {
  const replay = { key: "retry-1", method: "PATCH", path: "/api/v1/documents/document" };
  const input = { actor: { userId: "user" }, params: { documentId: "document" }, body: { name: "x" }, replay };
  update.mockResolvedValue({ id: "document" });
  await handler(input);
  expect(update).toHaveBeenLastCalledWith(input.actor, "document", { name: "x" }, replay);
});

it("forwards DELETE with actor, event, body and replay", async () => {
  const replay = { key: "retry-2", method: "DELETE", path: "/api/v1/documents/document" };
  const input = {
    actor: { userId: "user" },
    params: { documentId: "document" },
    body: { tripId: "trip" },
    replay,
  };
  remove.mockResolvedValue(null);
  await expect(deleteHandler(input)).resolves.toBeNull();
  expect(remove).toHaveBeenCalledWith(input.actor, "document", input.body, replay);
});

it("forwards combined name and absolute scope changes with replay metadata", async () => {
  const replay = { key: "scope-retry", method: "PATCH", path: "/api/v1/documents/document" };
  const input = {
    actor: { userId: "user" },
    params: { documentId: "document" },
    body: { name: "Pass", reservationId: null },
    replay,
  };
  await handler(input);
  expect(update).toHaveBeenLastCalledWith(input.actor, "document", input.body, replay);
});
