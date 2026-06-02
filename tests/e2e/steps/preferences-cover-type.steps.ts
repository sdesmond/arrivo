import { expect } from "@playwright/test";
import { When, Then } from "../fixtures";

When("I select the {string} cover type", async ({ page }, label: string) => {
  await page.getByRole("button", { name: label, exact: true }).click();
});

Then("the {string} cover type should be selected after reload", async ({ page }, label: string) => {
  await page.reload();
  await page.getByRole("tab", { name: "Preferences" }).click();
  const toggle = page.getByRole("button", { name: label, exact: true });
  await expect(toggle).toBeAttached({ timeout: 5000 });
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
});
