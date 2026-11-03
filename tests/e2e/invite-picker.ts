import { expect, type Page } from "@playwright/test";

/** Picks a registered user in the share dialog's invite combobox; free text alone never selects. */
export async function pickInviteUser(page: Page, username: string): Promise<void> {
  const input = page.getByLabel("Invite username");
  await input.fill(username);
  await page.getByRole("option", { name: username, exact: true }).click();
  await expect(input).toHaveValue(username);
}
