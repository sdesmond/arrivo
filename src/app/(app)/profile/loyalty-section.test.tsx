import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoyaltySection } from "./loyalty-section";

vi.mock("./actions", () => ({
  addLoyaltyNumber: vi.fn(),
  deleteLoyaltyNumber: vi.fn(),
}));

describe("LoyaltySection icon controls", () => {
  it("keeps copy and remove targets at 44px, including copied feedback", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    render(
      <LoyaltySection
        loyaltyNumbers={[{ id: "loyalty-1", programName: "Test Airlines", memberNumber: "TA-123456", position: 0 }]}
      />
    );

    const copy = screen.getByRole("button", { name: "Copy member number" });
    const remove = screen.getByRole("button", { name: "Remove Test Airlines" });
    expect(copy).toHaveClass("size-11", "shrink-0");
    expect(remove).toHaveClass("size-11", "shrink-0");
    expect(copy).toHaveAttribute("title", "Copy member number");
    expect(remove).toHaveAttribute("title", "Remove");

    await user.click(copy);
    expect(writeText).toHaveBeenCalledWith("TA-123456");
    expect(screen.getByRole("button", { name: "Copied!" })).toHaveClass("size-11");
  });
});
