import { expect, type APIResponse, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { collaborators, expenses, reservations } from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import { e2eTripDateTime } from "../e2e-seed-data";
import { apiClient } from "../anonymous-api";
import { Given, When, Then } from "../fixtures";
import { headers } from "../api-support";

const reservationReadStates = new WeakMap<Page, { tripId: string; id: string; response?: APIResponse }>();
Given("a reservation with a document and expense for API visibility", async ({ page, scenario }) => {
  const { trip } = await scenario.materialize({
    trip: {
      mother: "threeDayTrip",
      overrides: {
        reservations: [
          {
            type: "other",
            provider: "API visibility",
            startAt: e2eTripDateTime(0, "15:00:00.000"),
            endAt: e2eTripDateTime(2, "11:00:00.000"),
          },
        ],
        documents: [{ name: "Ticket", kind: "other", url: "/test/ticket", reservationProvider: "API visibility" }],
      },
      setCurrent: false,
    },
  });
  const [row] = await withE2EDb((database) =>
    database.select().from(reservations).where(eq(reservations.tripId, trip!.id))
  );
  await withE2EDb((database) =>
    database.insert(expenses).values({
      tripId: trip!.id,
      reservationId: row.id,
      category: "misc",
      amount: "42.00",
      currency: "USD",
      date: "2030-01-01",
    })
  );
  reservationReadStates.set(page, { tripId: trip!.id, id: row.id });
});
Given("my reservation API role is {string}", async ({ page, scenario }, role: string) => {
  const state = reservationReadStates.get(page)!;
  const { user } = await scenario.materialize({ user: { setCurrent: false } });
  if (role !== "nonmember")
    await withE2EDb((database) =>
      database.insert(collaborators).values({
        tripId: state.tripId,
        userId: user!.id,
        name: user!.name,
        initials: user!.initials,
        role,
        isCreator: false,
      })
    );
  await scenario.signInAsUser(page, user!.username);
});
When("I request reservations", async ({ page }) => {
  const state = reservationReadStates.get(page)!;
  state.response = await (
    await apiClient(page)
  ).get(`/api/v1/trips/${state.tripId}/reservations`, { headers: headers(page) });
});
Then("the reservation API visibility matches {string}", async ({ page }, role: string) => {
  const state = reservationReadStates.get(page)!;
  expect(state.response!.status()).toBe(role === "nonmember" ? 404 : 200);
  if (role === "nonmember") return;
  const body = await state.response!.json();
  expect(body.reservations).toHaveLength(1);
  expect(body.reservations[0]).toMatchObject({
    id: state.id,
    provider: "API visibility",
    documents: [{ name: "Ticket" }],
  });
  if (role === "viewer") expect(body.reservations[0].expense).toBeUndefined();
  else expect(body.reservations[0].expense).toMatchObject({ amount: 42, currency: "USD" });
});
When("I attempt to clear the reservation end via the API", async ({ page }) => {
  const state = reservationReadStates.get(page)!;
  state.response = await (
    await apiClient(page)
  ).patch(`/api/v1/reservations/${state.id}`, {
    headers: headers(page),
    data: { endAt: null },
  });
});
Then("the reservation API rejects the clear as forbidden", async ({ page }) => {
  const response = reservationReadStates.get(page)!.response!;
  expect(response.status()).toBe(403);
  expect(await response.json()).toMatchObject({ error: { code: "forbidden" } });
});
Then("the reservation API accepts the clear", async ({ page }) => {
  const state = reservationReadStates.get(page)!;
  expect(state.response!.status()).toBe(200);
  const body = await state.response!.json();
  expect(body.id).toBe(state.id);
  expect(body).not.toHaveProperty("endAt");
});
async function getReservationItem(page: Page) {
  const { id } = reservationReadStates.get(page)!;
  const response = await (await apiClient(page)).get(`/api/v1/reservations/${id}`, { headers: headers(page) });
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body).toMatchObject({ id, startAt: e2eTripDateTime(0, "15:00:00.000") });
  return body;
}
Then("the reservation item GET shows the original end and hides the expense", async ({ page }) => {
  const body = await getReservationItem(page);
  expect(body.endAt).toBe(e2eTripDateTime(2, "11:00:00.000"));
  expect(body).not.toHaveProperty("expense");
});
Then("the reservation item GET shows the original end and linked expense", async ({ page }) => {
  const body = await getReservationItem(page);
  expect(body.endAt).toBe(e2eTripDateTime(2, "11:00:00.000"));
  expect(body.expense).toMatchObject({ amount: 42, currency: "USD" });
});
Then("the reservation item GET omits the cleared end and shows the linked expense", async ({ page }) => {
  const body = await getReservationItem(page);
  expect(body).not.toHaveProperty("endAt");
  expect(body.expense).toMatchObject({ amount: 42, currency: "USD" });
});
