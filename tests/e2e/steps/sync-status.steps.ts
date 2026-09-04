import { expect } from "@playwright/test";
import { Then } from "../fixtures";

Then("the live sync status shows {string}", async ({ page }, status: string) => {
  await expect(page.getByTestId("sync-status-indicator")).toContainText(status, { timeout: 15_000 });
});
