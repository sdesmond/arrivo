import { expect } from "@playwright/test";
import { Given, When, Then } from "../fixtures";

Given("I am on the Reservations tab", async ({ page }) => {
  await page.getByRole("button", { name: "Reservations" }).click();
  await expect(page.getByRole("button", { name: "Add Reservation" })).toBeVisible({ timeout: 10_000 });
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
            startAt: "2030-01-10T15:00:00Z",
            endAt: "2030-01-12T11:00:00Z",
          },
          {
            type: "flight",
            provider: "Later Air",
            startAt: "2030-02-15T10:00:00Z",
          },
        ],
      },
      setCurrent: true,
    },
  });

  await scenario.gotoCurrentTrip(page);
  await page.getByRole("button", { name: "Reservations" }).click();
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
            startAt: "2030-01-10T15:00:00Z",
            endAt: "2030-01-12T11:00:00Z",
          },
        ],
      },
      setCurrent: true,
    },
  });
  await scenario.gotoCurrentTrip(page);
  await page.getByRole("button", { name: "Reservations" }).click();
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
  // ReservationAnchorEditField gives the anchor display button a stable aria-label of
  // "{label}: {formatted value}" — select on that rather than visible text.
  await page.getByRole("button", { name: new RegExp(`^${anchorLabel}: `) }).click();
  await page.getByLabel(`${anchorLabel} time`).fill(time);
  await page.getByRole("button", { name: `Save ${anchorLabel}` }).click();
});

Then("the reservation provider shows {string}", async ({ page }, provider: string) => {
  await expect(page.getByRole("button", { name: provider, exact: true })).toBeVisible({ timeout: 10_000 });
});

Then("the {string} anchor shows a time of {string}", async ({ page }, anchorLabel: string, time: string) => {
  // Assert via the anchor button's aria-label ("{label}: {formatted value}") rather than visible
  // text, matching only the minutes portion since formatAnchorDateTime's hour formatting is
  // timezone-dependent (see deferred-work.md).
  await expect(
    page.getByRole("button", { name: new RegExp(`^${anchorLabel}: .*${time.split(":")[1]}\\s*(AM|PM)`) })
  ).toBeVisible({ timeout: 10_000 });
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

Given("the trip has a Lodging reservation with an attached document", async ({ page, scenario }) => {
  await scenario.materialize({
    trip: {
      mother: "threeDayTrip",
      overrides: {
        reservations: [
          {
            type: "lodging",
            provider: "Original Hotel Name",
            startAt: "2030-01-10T15:00:00Z",
            endAt: "2030-01-12T11:00:00Z",
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
  await page.getByRole("button", { name: "Reservations" }).click();
});

When("I attach a file to the reservation {string}", async ({ page }) => {
  const [fileChooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: "Add confirmation document" }).click(),
  ]);
  await fileChooser.setFiles({
    name: "test-doc.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("PDF content"),
  });
});

Then("the document {string} appears on the reservation {string}", async ({ page }, docName: string) => {
  await expect(page.getByText(docName)).toBeVisible({ timeout: 10_000 });
});
