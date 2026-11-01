import { describe, expect, it, vi } from "vitest";
import type { Locator, Page } from "@playwright/test";
import { openDialog } from "./dialog";

function fakePage(dialog: Partial<Record<"isVisible" | "waitFor", unknown>>) {
  return { getByRole: vi.fn().mockReturnValue(dialog) } as unknown as Page;
}

describe("openDialog", () => {
  it("clicks the trigger once when the dialog opens", async () => {
    const dialog = { isVisible: vi.fn().mockResolvedValue(false), waitFor: vi.fn().mockResolvedValue(undefined) };
    const trigger = { click: vi.fn().mockResolvedValue(undefined) };
    await openDialog(fakePage(dialog), trigger as unknown as Locator);
    expect(trigger.click).toHaveBeenCalledTimes(1);
  });

  it("clicks again when an early click opened nothing", async () => {
    const dialog = {
      isVisible: vi.fn().mockResolvedValue(false),
      waitFor: vi.fn().mockRejectedValueOnce(new Error("not yet")).mockResolvedValue(undefined),
    };
    const trigger = { click: vi.fn().mockResolvedValue(undefined) };
    await openDialog(fakePage(dialog), trigger as unknown as Locator);
    expect(trigger.click).toHaveBeenCalledTimes(2);
  });

  it("does not toggle a slow dialog shut by clicking while it is visible", async () => {
    const dialog = {
      isVisible: vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true),
      waitFor: vi.fn().mockRejectedValueOnce(new Error("slow")).mockResolvedValue(undefined),
    };
    const trigger = { click: vi.fn().mockResolvedValue(undefined) };
    await openDialog(fakePage(dialog), trigger as unknown as Locator);
    expect(trigger.click).toHaveBeenCalledTimes(1);
  });

  it("throws the wait error once the attempts run out", async () => {
    const dialog = {
      isVisible: vi.fn().mockResolvedValue(false),
      waitFor: vi.fn().mockRejectedValue(new Error("never")),
    };
    const trigger = { click: vi.fn().mockResolvedValue(undefined) };
    await expect(openDialog(fakePage(dialog), trigger as unknown as Locator, { attempts: 3 })).rejects.toThrow("never");
    expect(trigger.click).toHaveBeenCalledTimes(3);
  });
});
