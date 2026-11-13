import { findScenarioDocument } from "../document-fixture";
import { expect, type APIResponse, type Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { collaborators, documents, pendingFileDeletions, reservations } from "../../../src/db/schema";
import { E2E_STORAGE_DIRECTORY } from "../../../scripts/e2e-storage.mjs";
import { waitForApiResponse } from "../api-response";
import { withE2EDb } from "../e2e-db";
import { holdScenarioTripLock, type HeldTripLock } from "../document-scope-concurrency";
import { e2eTripDate, e2eTripDateTime } from "../e2e-seed-data";
import { waitForServerActionResponse } from "../server-action";
import { After, Given, When, Then } from "../fixtures";

const RESERVATION_PDF = Buffer.from("%PDF-1.4 PDF content %%EOF");
const RACE_TIMEOUT_MS = 30_000;

/** The two writers of a race: both start while the scenario holds the trip lock, in the order the scenario chooses. */
interface DocumentScopeRace {
  lock: HeldTripLock;
  promotion?: Promise<APIResponse>;
  deletion?: Promise<Error | undefined>;
  promotionResponse?: APIResponse;
  deletionError?: Error;
}
const documentScopeRaces = new WeakMap<Page, DocumentScopeRace>();
const recordedFileUrls = new WeakMap<Page, string>();

After(async ({ page }) => {
  const race = documentScopeRaces.get(page);
  if (!race) return;
  documentScopeRaces.delete(page);
  // Free the lock first so a writer a failed scenario left queued can finish, then wait for both to settle.
  await race.lock.release();
  await Promise.allSettled([race.promotion, race.deletion]);
});

async function scenarioDocument(tripId: string, name: string) {
  const row = await findScenarioDocument(tripId, name);
  if (!row) throw new Error(`Scenario document "${name}" missing`);
  const [document] = await withE2EDb((database) => database.select().from(documents).where(eq(documents.id, row.id)));
  return document;
}

function formatTimeForDisplay(time: string): string {
  const [hourString, minute] = time.split(":");
  const hour = Number(hourString);
  const displayHour = hour % 12 || 12;
  const meridiem = hour >= 12 ? "PM" : "AM";
  return `${displayHour}:${minute} ${meridiem}`;
}

async function selectCalendarDate(page: Page, anchorLabel: string, dateString: string): Promise<void> {
  const [yearString, monthString, dayString] = dateString.split("-");
  const year = Number(yearString);
  const month = Number(monthString);
  const day = Number(dayString);
  const today = new Date();
  const targetMonthIndex = year * 12 + (month - 1);
  const currentMonthIndex = today.getUTCFullYear() * 12 + today.getUTCMonth();
  const stepCount = targetMonthIndex - currentMonthIndex;
  const navButtonName = stepCount >= 0 ? /Go to the Next Month/i : /Go to the Previous Month/i;
  const targetDataDay = `${month}/${day}/${year}`;

  await page.getByRole("button", { name: `${anchorLabel} date` }).click();
  const popover = page.locator('[data-slot="popover-content"]').last();
  for (let attempt = 0; attempt < Math.abs(stepCount); attempt += 1) {
    if ((await popover.locator(`[data-day="${targetDataDay}"]`).count()) > 0) {
      break;
    }
    await popover.getByRole("button", { name: navButtonName }).click();
  }

  const targetDay = popover.locator(`[data-day="${targetDataDay}"]`).first();
  await expect(targetDay).toBeVisible({ timeout: 10_000 });
  await targetDay.click();
}

Given("I am on the Reservations tab", async ({ page }) => {
  await page.getByRole("button", { name: "Reservations", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Add Reservation" }).or(page.getByRole("button", { name: "Set trip dates" }))
  ).toBeVisible({ timeout: 10_000 });
});

Given("the trip has reservations across multiple types", async ({ page, scenario }) => {
  await scenario.materialize({
    trip: {
      mother: "threeDayTrip",
      overrides: {
        reservations: [
          {
            type: "lodging",
            provider: "Soonest Hotel",
            startAt: e2eTripDateTime(0, "15:00:00"),
            endAt: e2eTripDateTime(2, "11:00:00"),
          },
          {
            type: "flight",
            provider: "Later Air",
            startAt: e2eTripDateTime(40, "10:00:00"),
          },
        ],
      },
      setCurrent: true,
    },
  });

  await scenario.gotoCurrentTrip(page);
  await page.getByRole("button", { name: "Reservations", exact: true }).click();
});

When("I select the {string} reservation type", async ({ page }, typeLabel: string) => {
  await page.getByRole("menuitem", { name: typeLabel }).click();
});

Then("the {string} drawer is open", async ({ page }, title: string) => {
  await expect(page.getByText(title)).toBeVisible({ timeout: 10_000 });
});

When("I fill in the reservation provider with {string}", async ({ page }, provider: string) => {
  await page.getByLabel("Provider *").fill(provider);
});

When("I set the {string} date to today", async ({ page }, anchorLabel: string) => {
  await page.getByRole("button", { name: `${anchorLabel} date` }).click();
  await page
    .locator('[data-slot="popover-content"]')
    .getByRole("button", { name: /^Today,/ })
    .click();
});

When("I set the {string} date to trip day {int}", async ({ page }, anchorLabel: string, dayNumber: number) => {
  await selectCalendarDate(page, anchorLabel, e2eTripDate(dayNumber - 1));
});

When("I set the {string} time to {string}", async ({ page }, anchorLabel: string, time: string) => {
  await page.getByLabel(`${anchorLabel} time`).fill(time);
});

When("I click {string} on the reservation drawer", async ({ page }, buttonText: string) => {
  // The dev-only mock-date toggle is fixed at bottom-right and overlaps the drawer footer, so focus + Enter
  // avoids the pointer interception that a real click would hit.
  const button = page.getByRole("button", { name: buttonText });
  await button.focus();
  await button.press("Enter");
});

When(
  "I choose the first lookup suggestion for the {string} reservation address",
  async ({ page }, anchorLabel: string) => {
    const input = page.getByLabel(new RegExp(`^${anchorLabel} address`));
    await input.fill("Par");
    await expect(page.getByRole("listbox")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("option").first().click();
    await expect(input).toHaveValue("Paris, France");
    await expect(input).not.toHaveAttribute("aria-busy", "true", { timeout: 15_000 });
  }
);

Then(
  "the reservation {string} appears in the {string} section",
  async ({ page }, provider: string, sectionLabel: string) => {
    const section = page.getByRole("button", { name: new RegExp(`^${sectionLabel}, `) });
    await expect(section).toBeVisible({ timeout: 10_000 });
    if ((await section.getAttribute("aria-expanded")) === "false") {
      await section.click();
    }
    await expect(page.getByText(provider)).toBeVisible({ timeout: 10_000 });
  }
);

Then("I see the {string} empty state", async ({ page }, title: string) => {
  await expect(page.getByText(title)).toBeVisible({ timeout: 10_000 });
});

Then("the Add Reservation button is visible", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Add Reservation" })).toBeVisible({ timeout: 10_000 });
});

Then("no reservation type sections are shown", async ({ page }) => {
  await expect(page.getByRole("button", { name: /reservation,/ })).toHaveCount(0);
});

Then(
  "the {string} reservation section appears before the {string} reservation section",
  async ({ page }, firstLabel: string, secondLabel: string) => {
    const sections = page.getByRole("button", { name: /reservation,/ });
    await expect(sections).toHaveCount(2, { timeout: 10_000 });
    await expect(sections.nth(0)).toHaveAccessibleName(new RegExp(`^${firstLabel}, `));
    await expect(sections.nth(1)).toHaveAccessibleName(new RegExp(`^${secondLabel}, `));
  }
);

Given("the trip has a Lodging reservation", async ({ page, scenario }) => {
  await scenario.materialize({
    trip: {
      mother: "threeDayTrip",
      overrides: {
        reservations: [
          {
            type: "lodging",
            provider: "Original Hotel Name",
            startAt: e2eTripDateTime(0, "15:00:00"),
            endAt: e2eTripDateTime(2, "11:00:00"),
          },
        ],
      },
      setCurrent: true,
    },
  });
  await scenario.gotoCurrentTrip(page);
  await page.getByRole("button", { name: "Reservations", exact: true }).click();
});

Given("the {string} reservation section is expanded", async ({ page }, sectionLabel: string) => {
  const section = page.getByRole("button", { name: new RegExp(`^${sectionLabel}, `) });
  await expect(section).toBeVisible({ timeout: 10_000 });
  if ((await section.getAttribute("aria-expanded")) === "false") {
    await section.click();
  }
});

When("I edit the reservation provider to {string}", async ({ page }, newProvider: string) => {
  await page.getByRole("button", { name: "Original Hotel Name", exact: true }).click();
  const input = page.getByRole("textbox", { name: "Provider" });
  await input.fill(newProvider);
  await input.press("Enter");
  await expect(page.getByRole("button", { name: newProvider, exact: true })).toBeVisible({ timeout: 10_000 });
});

When("I edit the {string} anchor time to {string}", async ({ page }, anchorLabel: string, time: string) => {
  // Clicking the compact date-range display opens the inline date/time inputs directly.
  const timeInput = page.getByLabel(`${anchorLabel} time`);
  const row = page.locator('[data-testid^="reservation-row-"]').first();
  if (!(await timeInput.isVisible())) {
    await page
      .getByRole("button", { name: /^\w+ \d+,\s*\d+:\d+\s*(AM|PM)/ })
      .or(page.getByRole("button", { name: "Add dates" }))
      .first()
      .click();
  }
  await timeInput.fill(time);
  // Click a neutral point inside the row so blur saves without navigating away.
  await row.click({ position: { x: 8, y: 8 } });
  await expect(timeInput).not.toBeVisible({ timeout: 10_000 });
  const displayTime = formatTimeForDisplay(time);
  await expect(row.getByRole("button", { name: new RegExp(`\\b${displayTime}\\b`) }).first()).toBeVisible({
    timeout: 10_000,
  });
});

Then("the reservation provider shows {string}", async ({ page }, provider: string) => {
  await expect(page.getByRole("button", { name: provider, exact: true })).toBeVisible({ timeout: 10_000 });
});

Then(
  "the reservation {string} shows the {string} address {string}",
  async ({ page }, provider: string, anchorLabel: string, address: string) => {
    const row = page
      .locator("div")
      .filter({ has: page.getByRole("button", { name: provider, exact: true }) })
      .first();
    await expect(row.getByRole("button", { name: `${anchorLabel} · ${address}` })).toBeVisible({ timeout: 10_000 });
  }
);

Then("the {string} anchor shows a time of {string}", async ({ page }, anchorLabel: string, time: string) => {
  const displayTime = formatTimeForDisplay(time);
  await expect(page.getByRole("button", { name: new RegExp(`\\b${displayTime}\\b`) }).first()).toBeVisible({
    timeout: 10_000,
  });
});

When("I delete the reservation {string}", async ({ page }, provider: string) => {
  await page.getByRole("button", { name: `Delete ${provider}` }).click();
});

When("I confirm the deletion", async ({ page }) => {
  // exact: true avoids matching the row's "Delete {provider}" icon button.
  // focus+Enter matches the established pattern for drawer/dialog footer buttons to sidestep
  // the dev-only mock-date overlay (fixed bottom-right, z-index 9999).
  const button = page.getByRole("button", { name: "Delete", exact: true });
  await button.focus();
  await button.press("Enter");
});

Then("the reservation {string} is no longer shown", async ({ page }, provider: string) => {
  // Target the provider's display button (role=button, exact name) rather than any text node,
  // so a hidden-but-present element doesn't produce a false pass.
  await expect(page.getByRole("button", { name: provider, exact: true })).not.toBeVisible();
});

Then("the reservation {string} location fields are persisted", async ({ scenario }, provider: string) => {
  const currentTrip = scenario.currentTrip;
  if (!currentTrip) throw new Error("Missing current scenario trip.");

  await withE2EDb(async (db) => {
    const [reservation] = await db
      .select()
      .from(reservations)
      .where(and(eq(reservations.tripId, currentTrip.id), eq(reservations.provider, provider)));

    expect(reservation).toBeDefined();
    expect(reservation.startAddress).toBe("Paris, France");
    expect(reservation.startLocationName).toBeNull();
    expect(reservation.startLocationLat).toBe(48.8534);
    expect(reservation.startLocationLng).toBe(2.3488);
    expect(reservation.endAddress).toBe("Paris, France");
    expect(reservation.endLocationName).toBeNull();
    expect(reservation.endLocationLat).toBe(48.8534);
    expect(reservation.endLocationLng).toBe(2.3488);
  });
});

Given("the trip has a Lodging reservation with an attached document", async ({ page, scenario }) => {
  await scenario.materialize({
    trip: {
      mother: "threeDayTrip",
      overrides: {
        reservations: [
          {
            type: "lodging",
            provider: "Original Hotel Name",
            startAt: e2eTripDateTime(0, "15:00:00"),
            endAt: e2eTripDateTime(2, "11:00:00"),
          },
        ],
        documents: [
          {
            name: "test-doc.pdf",
            kind: "pdf",
            size: 1024,
            url: "http://localhost/stub/test-doc.pdf",
            reservationProvider: "Original Hotel Name",
          },
        ],
      },
      setCurrent: true,
    },
  });
  await scenario.gotoCurrentTrip(page);
  await page.getByRole("button", { name: "Reservations", exact: true }).click();
});

When("I attach a file to the reservation {string}", async ({ page, scenario }, reservationName: string) => {
  const [target] = await withE2EDb((database) =>
    database
      .select({ id: reservations.id })
      .from(reservations)
      .where(and(eq(reservations.tripId, scenario.currentTrip!.id), eq(reservations.provider, reservationName)))
  );
  await page.getByRole("button", { name: "Attach" }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "test-doc.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 PDF content %%EOF"),
  });
  const uploaded = waitForApiResponse(page, { method: "POST", path: `/api/v1/reservations/${target.id}/documents` });
  await page.getByRole("dialog").getByRole("button", { name: "Attach" }).click();
  await uploaded;
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

Given(
  "the trip has a Lodging reservation and a trip-level document {string}",
  async ({ page, scenario }, docName: string) => {
    await scenario.materialize({
      trip: {
        mother: "threeDayTrip",
        overrides: {
          reservations: [
            {
              type: "lodging",
              provider: "Original Hotel Name",
              startAt: e2eTripDateTime(0, "15:00:00"),
              endAt: e2eTripDateTime(2, "11:00:00"),
            },
          ],
          documents: [
            {
              name: docName,
              kind: "pdf",
              size: 1024,
              url: "http://localhost/stub/trip-doc.pdf",
            },
          ],
        },
        setCurrent: true,
      },
    });
    await scenario.gotoCurrentTrip(page);
    await page.getByRole("button", { name: "Reservations", exact: true }).click();
  }
);

When(
  "I rename the reservation doc {string} to {string}",
  async ({ page, scenario }, oldName: string, newName: string) => {
    const document = await findScenarioDocument(scenario.currentTrip!.id, oldName);
    if (!document) throw new Error("Scenario document missing");
    await page.getByRole("button", { name: /^docs?$/i }).click();
    await page.getByText(oldName, { exact: true }).first().click();
    const input = page.getByRole("textbox");
    await input.fill(newName);
    const renamed = waitForApiResponse(page, { method: "PATCH", path: `/api/v1/documents/${document.id}` });
    await input.press("Enter");
    await renamed;
  }
);

Then("the reservation doc {string} is visible", async ({ page }, docName: string) => {
  await expect(page.getByText(docName, { exact: true }).first()).toBeVisible({ timeout: 5_000 });
});

When("I promote the reservation doc {string} to trip level", async ({ page, scenario }, docName: string) => {
  const document = await findScenarioDocument(scenario.currentTrip!.id, docName);
  if (!document) throw new Error("Scenario document missing");
  if (!(await page.getByRole("button", { name: `Move ${docName} to trip` }).isVisible())) {
    await page.getByRole("button", { name: /^docs?$/i }).click();
  }
  const promoted = waitForApiResponse(page, { method: "PATCH", path: `/api/v1/documents/${document.id}` });
  await page.getByRole("button", { name: `Move ${docName} to trip` }).click();
  await promoted;
});

Then("the reservation doc {string} is no longer visible on the reservation", async ({ page }, docName: string) => {
  await expect(page.getByRole("button", { name: `Move ${docName} to trip` })).not.toBeVisible({ timeout: 10_000 });
});

Then("after reload the reservation shows uploaded document {string}", async ({ page }, name: string) => {
  await page.reload();
  await page.getByRole("button", { name: "Reservations", exact: true }).click();
  const section = page.getByRole("button", { name: /^Lodging, / });
  await expect(section).toBeVisible();
  if ((await section.getAttribute("aria-expanded")) === "false") await section.click();
  await page.getByTitle("Show attached documents").click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
});

When("I expand reservation documents", async ({ page }) => {
  await page.getByRole("button", { name: /^docs?$/i }).click();
});

When("I return to reservation documents", async ({ page }) => {
  await page.getByRole("button", { name: "Reservations", exact: true }).click();
  const section = page.getByRole("button", { name: /^Lodging, / });
  await expect(section).toBeVisible();
  if ((await section.getAttribute("aria-expanded")) === "false") await section.click();
});

When("I confirm the deletion and wait for it to save", async ({ page, scenario }) => {
  const saved = waitForServerActionResponse(page, { pathIncludes: `/trips/${scenario.currentTrip!.id}` });
  const button = page.getByRole("button", { name: "Delete", exact: true });
  await button.focus();
  await button.press("Enter");
  await saved;
});

Then("the trip document {string} downloads its original bytes", async ({ page, scenario }, name: string) => {
  const document = await scenarioDocument(scenario.currentTrip!.id, name);
  expect(document.reservationId).toBeNull();
  const response = await page.request.get(document.url!);
  expect(response.status()).toBe(200);
  expect(Buffer.from(await response.body())).toEqual(RESERVATION_PDF);
});

Then("a stranger cannot download the trip document {string}", async ({ page, scenario }, name: string) => {
  const document = await scenarioDocument(scenario.currentTrip!.id, name);
  await withE2EDb((database) =>
    database
      .delete(collaborators)
      .where(
        and(eq(collaborators.tripId, scenario.currentTrip!.id), eq(collaborators.userId, scenario.currentUser!.id))
      )
  );
  const response = await page.request.get(document.url!);
  expect(response.status()).toBe(404);
});

When("I hold the trip lock for a document promotion and a reservation deletion", async ({ page, scenario }) => {
  documentScopeRaces.set(page, { lock: await holdScenarioTripLock(scenario.currentTrip!.id) });
});

function race(page: Page): DocumentScopeRace {
  const current = documentScopeRaces.get(page);
  if (!current) throw new Error("The trip lock is not held for this scenario.");
  return current;
}

When("I start promoting the reservation doc {string} over the API", async ({ page, scenario }, name: string) => {
  const document = await scenarioDocument(scenario.currentTrip!.id, name);
  const promotion = page.request.patch(`/api/v1/documents/${document.id}`, {
    headers: {
      "x-arrivo-client": "web",
      origin: new URL(page.url()).origin,
      "content-type": "application/json",
    },
    data: { reservationId: null },
    timeout: RACE_TIMEOUT_MS,
  });
  // A scenario that fails before awaiting the request must not leave an unhandled rejection behind.
  promotion.catch(() => undefined);
  race(page).promotion = promotion;
});

When("I start deleting the reservation {string} and leave it waiting", async ({ page, scenario }, provider: string) => {
  await page.getByRole("button", { name: `Delete ${provider}` }).click();
  const saved = waitForServerActionResponse(page, {
    pathIncludes: `/trips/${scenario.currentTrip!.id}`,
    timeoutMs: RACE_TIMEOUT_MS,
  });
  const button = page.getByRole("button", { name: "Delete", exact: true });
  await button.focus();
  // Settle into a value so a scenario that fails before awaiting it cannot leave an unhandled rejection.
  race(page).deletion = saved.then(
    () => undefined,
    (error: Error) => error
  );
  await button.press("Enter");
});

Then("the trip lock has {int} blocked writer(s)", async ({ page }, count: number) => {
  await race(page).lock.waitForBlockedWriters(count);
});

When("I release the trip lock and let both writers finish", async ({ page }) => {
  const current = race(page);
  await current.lock.release();
  current.promotionResponse = await current.promotion!;
  current.deletionError = await current.deletion!;
});

Then("the promotion answered {int} and the reservation deletion saved", async ({ page }, status: number) => {
  const current = race(page);
  expect(current.promotionResponse!.status()).toBe(status);
  expect(current.deletionError).toBeUndefined();
});

When("I note the stored file of the reservation doc {string}", async ({ page, scenario }, name: string) => {
  recordedFileUrls.set(page, (await scenarioDocument(scenario.currentTrip!.id, name)).url!);
});

Then("the reservation document {string} and its noted file are gone", async ({ page, scenario }, name: string) => {
  const url = recordedFileUrls.get(page);
  if (!url) throw new Error("The stored file was not noted.");
  expect(await findScenarioDocument(scenario.currentTrip!.id, name)).toBeUndefined();
  await expect
    .poll(async () => {
      try {
        await readFile(join(resolve(E2E_STORAGE_DIRECTORY), url.replace(/^\/api\/storage\//, "")));
        return true;
      } catch {
        return false;
      }
    })
    .toBe(false);
  // The file was removed, so its queued name was cleared and nothing can serve it.
  await expect
    .poll(async () =>
      withE2EDb((database) =>
        database
          .select({ id: pendingFileDeletions.id })
          .from(pendingFileDeletions)
          .where(eq(pendingFileDeletions.url, url))
      ).then((rows) => rows.length)
    )
    .toBe(0);
  expect((await page.request.get(url)).status()).toBe(404);
});
