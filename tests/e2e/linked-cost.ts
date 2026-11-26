import { expect, type Locator, type Page } from "@playwright/test";
import { formatCurrencyChipAmount } from "../../src/lib/currencies";
import { waitForApiResponse } from "./api-response";

/** The expense a row's cost chip created, keyed by page so PATCH and DELETE can arm against its path. */
const linkedExpenseIds = new WeakMap<Page, string>();

function expensePath(page: Page): string {
  return `/api/v1/expenses/${linkedExpenseIds.get(page)}`;
}

function chipName(amount: string, currency: string): string {
  return formatCurrencyChipAmount(Number(amount), currency);
}

async function fillCostDialog(page: Page, amount: string, currency?: string, category?: string): Promise<Locator> {
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Cost" })).toBeVisible();
  if (currency) {
    await dialog.getByRole("button", { name: /Currency:/i }).click();
    await page.getByRole("textbox", { name: "Search currencies" }).fill(currency);
    await page.getByRole("option", { name: new RegExp(`${currency}$`, "i") }).click();
  }
  await dialog.getByRole("textbox", { name: "Amount" }).fill(amount);
  if (category) {
    await dialog.getByRole("button", { name: "Select category" }).click();
    await page.getByRole("option", { name: category, exact: true }).click();
  }
  return dialog;
}

/** Add a cost through the row's chip, waiting for the POST so a later reload cannot abort it. */
export async function addLinkedCost(
  page: Page,
  row: Locator,
  tripId: string,
  cost: { amount: string; currency: string; category: string }
): Promise<void> {
  await row.getByRole("button", { name: "Add cost" }).click();
  const dialog = await fillCostDialog(page, cost.amount, cost.currency, cost.category);
  const created = waitForApiResponse(page, { method: "POST", path: `/api/v1/trips/${tripId}/expenses` });
  await dialog.getByRole("button", { name: "Save" }).click();
  const { id } = (await (await created).json()) as { id: string };
  linkedExpenseIds.set(page, id);
  await expect(dialog).not.toBeVisible();
}

export async function editLinkedCost(page: Page, row: Locator, current: string, amount: string): Promise<void> {
  await row.getByRole("button", { name: current }).click();
  const dialog = await fillCostDialog(page, amount);
  const updated = waitForApiResponse(page, { method: "PATCH", path: expensePath(page) });
  await dialog.getByRole("button", { name: "Save" }).click();
  await updated;
  await expect(dialog).not.toBeVisible();
}

export async function removeLinkedCost(page: Page, row: Locator, current: string): Promise<void> {
  await row.getByRole("button", { name: current }).click();
  const dialog = page.getByRole("dialog");
  const removed = waitForApiResponse(page, { method: "DELETE", path: expensePath(page) });
  await dialog.getByRole("button", { name: "Remove" }).click();
  await removed;
  await expect(dialog).not.toBeVisible();
}

export async function expectLinkedCostChip(row: Locator, amount: string, currency: string): Promise<void> {
  await expect(row.getByRole("button", { name: chipName(amount, currency) })).toBeVisible();
}

export async function expectNoLinkedCost(row: Locator): Promise<void> {
  await expect(row.getByRole("button", { name: "Add cost" })).toBeVisible();
}
