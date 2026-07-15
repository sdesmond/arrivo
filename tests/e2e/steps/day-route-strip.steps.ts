import { expect } from "@playwright/test";
import { Then } from "../fixtures";

Then("no day route strip is visible", async ({ page }) => {
  await expect(page.getByText("Route unavailable")).toHaveCount(0);
});
