import { expect, type APIResponse, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { packingItems } from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import { apiClient } from "../anonymous-api";
import { When, Then } from "../fixtures";
import { headers, scopedPackingState, storedScopedPacking } from "../api-support";

const packingCreateIds = new WeakMap<Page, string>();
When("I create and retry an inline packing item", async ({ page }) => {
  const current = scopedPackingState(page);
  const client = await apiClient(page);
  const id = randomUUID();
  packingCreateIds.set(page, id);
  const data = { id, name: "Inline API item", listId: current.listId, beforeItemId: current.listIds[1] };
  const first = await client.post(`/api/v1/trips/${current.tripId}/packing-items`, { headers: headers(page), data });
  expect(first.status()).toBe(200);
  current.response = await client.post(`/api/v1/trips/${current.tripId}/packing-items`, {
    headers: headers(page),
    data,
  });
});
Then("the packing creation replay preserves the scoped order", async ({ page }) => {
  const current = scopedPackingState(page);
  expect(current.response!.status()).toBe(200);
  expect((await storedScopedPacking(current)).named).toEqual([
    current.listIds[0],
    packingCreateIds.get(page),
    current.listIds[1],
  ]);
});
When("I attempt a packing creation", async ({ page }) => {
  const current = scopedPackingState(page);
  current.response = await (
    await apiClient(page)
  ).post(`/api/v1/trips/${current.tripId}/packing-items`, {
    headers: headers(page),
    data: { id: randomUUID(), name: "Denied", listId: current.listId },
  });
});
When("I create a packing item with a foreign list section", async ({ page }) => {
  const current = scopedPackingState(page);
  await withE2EDb((database) =>
    database.update(packingItems).set({ isLabel: true }).where(eq(packingItems.id, current.defaultId))
  );
  current.response = await (
    await apiClient(page)
  ).post(`/api/v1/trips/${current.tripId}/packing-items`, {
    headers: headers(page),
    data: { id: randomUUID(), name: "Invalid", listId: current.listId, labelId: current.defaultId },
  });
});
interface PackingKeyedRequest {
  operation: string;
  path: string;
  body: object;
  key: string;
}
const packingKeyedRequests = new WeakMap<Page, PackingKeyedRequest>();
async function sendKeyedPackingRequest(page: Page, request: PackingKeyedRequest): Promise<APIResponse> {
  const client = await apiClient(page);
  const options = { headers: { ...headers(page), "Idempotency-Key": request.key }, data: request.body };
  return request.operation === "create" ? client.post(request.path, options) : client.delete(request.path, options);
}
When("I commit a keyed packing {string} request", async ({ page }, operation: string) => {
  const current = scopedPackingState(page);
  const sectionId = randomUUID();
  if (operation === "section") {
    await withE2EDb((database) =>
      database.insert(packingItems).values({
        id: sectionId,
        tripId: current.tripId,
        listId: current.listId,
        name: "Section",
        isLabel: true,
        position: 2,
        done: false,
      })
    );
  }
  const request: PackingKeyedRequest =
    operation === "create"
      ? {
          operation,
          path: `/api/v1/trips/${current.tripId}/packing-items`,
          body: { id: randomUUID(), name: "Keyed", listId: current.listId },
          key: randomUUID(),
        }
      : {
          operation,
          path: `/api/v1/packing-items/${sectionId}/section`,
          body: { tripId: current.tripId, mode: "delete-items" },
          key: randomUUID(),
        };
  packingKeyedRequests.set(page, request);
  expect((await sendKeyedPackingRequest(page, request)).status()).toBe(operation === "create" ? 200 : 204);
  expect((await sendKeyedPackingRequest(page, request)).status()).toBe(operation === "create" ? 200 : 204);
});
When("I replay the keyed packing request", async ({ page }) => {
  scopedPackingState(page).response = await sendKeyedPackingRequest(page, packingKeyedRequests.get(page)!);
});
When("I delete a missing packing section", async ({ page }) => {
  const current = scopedPackingState(page);
  current.response = await (
    await apiClient(page)
  ).delete(`/api/v1/packing-items/${randomUUID()}/section`, {
    headers: headers(page),
    data: { tripId: current.tripId, mode: "delete-items" },
  });
});
