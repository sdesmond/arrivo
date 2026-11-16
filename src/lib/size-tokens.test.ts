import { describe, it, expect } from "vitest";
import { IconSize } from "./size-tokens";

/** WCAG 2.5.8 minimum target the itinerary row actions are drawn inside (`size-11`). */
const ROW_ACTION_TARGET_PX = 44;

describe("IconSize", () => {
  it("uses whole positive pixel values so Lucide icons render crisply", () => {
    for (const [name, size] of Object.entries(IconSize)) {
      expect(Number.isInteger(size), name).toBe(true);
      expect(size, name).toBeGreaterThan(0);
    }
  });

  it("sizes the row drag and delete icons to read clearly inside their 44px targets", () => {
    expect(IconSize.rowAction).toBeGreaterThanOrEqual(16);
    expect(IconSize.rowAction).toBeLessThan(ROW_ACTION_TARGET_PX / 2);
  });

  it("keeps row action icons larger than the action-bar chip icons beneath the title", () => {
    expect(IconSize.rowAction).toBeGreaterThan(IconSize.actionChip);
  });
});
