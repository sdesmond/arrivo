import { expect } from "@playwright/test";
import { Before, When, Then } from "../fixtures";

Before({ tags: "@cover-type-initial-map" }, async ({ scenario }) => {
  await scenario.materialize({
    user: {
      overrides: {
        user: {
          defaultCoverType: "map",
        },
      },
      setCurrent: true,
    },
  });
});

When("I select the {string} cover type", async ({ page }, label: string) => {
  const targetToggle = page.getByRole("button", { name: label, exact: true });
  if ((await targetToggle.getAttribute("aria-pressed")) === "true") {
    const alternateLabel = label === "Map" ? "Graphic" : "Map";
    await page.getByRole("button", { name: alternateLabel, exact: true }).click();
  }
  await targetToggle.click();
});

Then("the {string} cover type should be selected after reload", async ({ page }, label: string) => {
  await page.reload();
  await page.getByRole("tab", { name: "Preferences" }).click();
  const toggle = page.getByRole("button", { name: label, exact: true });
  await expect(toggle).toBeAttached({ timeout: 5000 });
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
});
