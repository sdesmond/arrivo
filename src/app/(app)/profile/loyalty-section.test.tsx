import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { stubPlainHttpClipboard } from "@/test-utils/plain-http-clipboard";
import { LoyaltySection } from "./loyalty-section";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

vi.mock("./actions", () => ({
  addLoyaltyNumber: vi.fn(),
  deleteLoyaltyNumber: vi.fn(),
}));

const LOYALTY_NUMBER = { id: "loyalty-1", programName: "Test Airlines", memberNumber: "TA-123456", position: 0 };

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

  it("copies through the fallback when the Clipboard API is unavailable", async () => {
    const user = userEvent.setup();
    const { execCommand, restore } = stubPlainHttpClipboard();
    try {
      render(<LoyaltySection loyaltyNumbers={[LOYALTY_NUMBER]} />);
      await user.click(screen.getByRole("button", { name: "Copy member number" }));
      expect(execCommand).toHaveBeenCalledWith("copy");
      expect(screen.getByRole("button", { name: "Copied!" })).toBeInTheDocument();
    } finally {
      restore();
    }
  });

  it("reports a failed copy instead of confirming it", async () => {
    const user = userEvent.setup();
    vi.mocked(toast.error).mockClear();
    const { restore } = stubPlainHttpClipboard();
    Object.defineProperty(document, "execCommand", { value: vi.fn(() => false), configurable: true, writable: true });
    try {
      render(<LoyaltySection loyaltyNumbers={[LOYALTY_NUMBER]} />);
      await user.click(screen.getByRole("button", { name: "Copy member number" }));
      expect(toast.error).toHaveBeenCalledWith("Could not copy member number.");
      expect(screen.queryByRole("button", { name: "Copied!" })).not.toBeInTheDocument();
    } finally {
      restore();
    }
  });
});
