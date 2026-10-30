import type { Locator, Page } from "@playwright/test";

const ATTEMPT_TIMEOUT_MS = 1_500;
const DEFAULT_ATTEMPTS = 6;

/**
 * Clicks a dialog trigger until the dialog is up. The trigger is server-rendered, so a click that lands before the
 * page hydrates opens nothing and the next step would wait on a dialog that never appears. A dialog that is already
 * visible is never clicked again, so a slow open is not toggled shut.
 */
export async function openDialog(page: Page, trigger: Locator, { attempts = DEFAULT_ATTEMPTS } = {}): Promise<void> {
  const dialog = page.getByRole("dialog");
  for (let attempt = 1; ; attempt++) {
    if (!(await dialog.isVisible())) await trigger.click();
    try {
      await dialog.waitFor({ state: "visible", timeout: ATTEMPT_TIMEOUT_MS });
      return;
    } catch (error) {
      if (attempt >= attempts) throw error;
    }
  }
}
