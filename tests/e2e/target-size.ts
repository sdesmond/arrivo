import { expect, type Locator } from "@playwright/test";

const MIN_TARGET_PX = 44;
const DEFAULT_TIMEOUT_MS = 10_000;
const READ_TIMEOUT_MS = 2_000;

interface TargetSizeOptions {
  /** `"height"` for controls whose width is content-driven (e.g. full-width fields). */
  dimensions?: "both" | "height";
  timeout?: number;
}

/**
 * Asserts a control's rendered box meets the 44×44 CSS px target minimum (WCAG 2.5.8).
 *
 * The rect is re-read until it passes: a step that resizes the viewport, zooms text, or waits out an
 * open animation can measure mid-reflow (or catch the control between re-mounts) and see a 0×0 box,
 * even though `waitFor({ state: "visible" })` already passed. Each read is a single `evaluate`, so
 * width and height always come from the same layout; no scrolling, since that also races a reflow.
 */
export async function expectTargetAtLeast44px(
  control: Locator,
  { dimensions = "both", timeout = DEFAULT_TIMEOUT_MS }: TargetSizeOptions = {}
): Promise<void> {
  await control.waitFor({ state: "visible", timeout });
  await expect(async () => {
    const rect = await control.evaluate(
      (element) => {
        const box = element.getBoundingClientRect();
        return { width: box.width, height: box.height };
      },
      undefined,
      { timeout: READ_TIMEOUT_MS }
    );
    if (dimensions === "both") expect(rect.width, "target width").toBeGreaterThanOrEqual(MIN_TARGET_PX);
    expect(rect.height, "target height").toBeGreaterThanOrEqual(MIN_TARGET_PX);
  }).toPass({ timeout });
}
