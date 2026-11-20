import { expect, type APIResponse, type Page } from "@playwright/test";
import { apiClient } from "../anonymous-api";
import { When, Then } from "../fixtures";

interface SnapshotState {
  responses: APIResponse[];
  tags: string[];
}
const states = new WeakMap<Page, SnapshotState>();

function state(page: Page): SnapshotState {
  let current = states.get(page);
  if (!current) {
    current = { responses: [], tags: [] };
    states.set(page, current);
  }
  return current;
}
function headers(page: Page, extra: Record<string, string> = {}) {
  return { "x-arrivo-client": "web", origin: new URL(page.url()).origin, ...extra };
}
async function getSnapshot(page: Page, tripId: string, extra: Record<string, string> = {}): Promise<APIResponse> {
  const response = await (await apiClient(page)).get(`/api/v1/trips/${tripId}`, { headers: headers(page, extra) });
  const current = state(page);
  current.responses.push(response);
  const tag = response.headers().etag;
  if (tag) current.tags.push(tag);
  return response;
}
function lastResponse(page: Page): APIResponse {
  const response = state(page).responses.at(-1);
  if (!response) throw new Error("No trip snapshot response");
  return response;
}

When("I fetch the trip snapshot", async ({ page, scenario }) => {
  await getSnapshot(page, scenario.currentTrip!.id);
});
When("I fetch the trip snapshot again", async ({ page, scenario }) => {
  await getSnapshot(page, scenario.currentTrip!.id);
});
When("I fetch the trip snapshot with the earlier ETag", async ({ page, scenario }) => {
  await getSnapshot(page, scenario.currentTrip!.id, { "if-none-match": state(page).tags[0] });
});
When("the trip is renamed through the snapshot API", async ({ page, scenario }) => {
  const response = await (
    await apiClient(page)
  ).patch(`/api/v1/trips/${scenario.currentTrip!.id}`, {
    headers: headers(page, { "content-type": "application/json" }),
    data: { name: "Renamed for the snapshot" },
  });
  expect(response.status()).toBe(200);
});

Then("both trip snapshots share one ETag", async ({ page }) => {
  const { tags, responses } = state(page);
  expect(responses.map((response) => response.status())).toEqual([200, 200]);
  expect(tags).toHaveLength(2);
  expect(tags[0]).toBe(tags[1]);
  expect(responses[0].headers()["cache-control"]).toBe("private, no-cache");
});
Then("the trip snapshot answers 304 without a body", async ({ page }) => {
  const response = lastResponse(page);
  expect(response.status()).toBe(304);
  expect(await response.text()).toBe("");
  expect(response.headers().etag).toBe(state(page).tags[0]);
});
Then("the trip snapshot ETag differs from the earlier one", async ({ page }) => {
  const { tags } = state(page);
  expect(lastResponse(page).status()).toBe(200);
  expect(tags.at(-1)).not.toBe(tags[0]);
  expect((await lastResponse(page).json()).trip.name).toBe("Renamed for the snapshot");
});
Then("the trip snapshot returns the trip with access role {string}", async ({ page, scenario }, role: string) => {
  const response = lastResponse(page);
  expect(response.status()).toBe(200);
  const payload = await response.json();
  expect(payload.trip.id).toBe(scenario.currentTrip!.id);
  expect(payload.accessRole).toBe(role);
  if (role === "viewer") expect(payload.expenses).toEqual([]);
});
Then("the trip snapshot answers 404 with code {string}", async ({ page }, code: string) => {
  const response = lastResponse(page);
  expect(response.status()).toBe(404);
  expect((await response.json()).error.code).toBe(code);
  expect(response.headers().etag).toBeUndefined();
});
