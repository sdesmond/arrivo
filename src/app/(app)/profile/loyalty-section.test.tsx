import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { stubPlainHttpClipboard } from "@/test-utils/plain-http-clipboard";
import { FIELD_LIMITS } from "@/lib/validation-limits";
import { LoyaltySection } from "./loyalty-section";
import { addLoyaltyNumber, deleteLoyaltyNumber } from "./actions";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("./actions", () => ({
  addLoyaltyNumber: vi.fn(),
  deleteLoyaltyNumber: vi.fn(),
}));

const LOYALTY_NUMBER = { id: "loyalty-1", programName: "Test Airlines", memberNumber: "TA-123456", position: 0 };

describe("LoyaltySection icon controls", () => {
  it("keeps copy and remove targets at 44px and confirms the copy with the shared toast", async () => {
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
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Copied to clipboard"));
    expect(screen.getByRole("button", { name: "Copy member number" })).toHaveClass("size-11");
  });

  it("copies through the fallback when the Clipboard API is unavailable", async () => {
    const user = userEvent.setup();
    const { execCommand, restore } = stubPlainHttpClipboard();
    try {
      render(<LoyaltySection loyaltyNumbers={[LOYALTY_NUMBER]} />);
      await user.click(screen.getByRole("button", { name: "Copy member number" }));
      expect(execCommand).toHaveBeenCalledWith("copy");
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Copied to clipboard"));
    } finally {
      restore();
    }
  });

  it("reports a failed copy instead of confirming it", async () => {
    const user = userEvent.setup();
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
    const { restore } = stubPlainHttpClipboard();
    Object.defineProperty(document, "execCommand", { value: vi.fn(() => false), configurable: true, writable: true });
    try {
      render(<LoyaltySection loyaltyNumbers={[LOYALTY_NUMBER]} />);
      await user.click(screen.getByRole("button", { name: "Copy member number" }));
      expect(toast.error).toHaveBeenCalledWith("Could not copy member number.");
      expect(toast.success).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });
});

describe("LoyaltySection adding", () => {
  it("caps program name and member number at the shared limits", () => {
    render(<LoyaltySection loyaltyNumbers={[]} />);
    expect(screen.getByPlaceholderText("Program name")).toHaveAttribute(
      "maxLength",
      String(FIELD_LIMITS.loyaltyProgram)
    );
    expect(screen.getByPlaceholderText("Member #")).toHaveAttribute("maxLength", String(FIELD_LIMITS.loyaltyNumber));
  });

  it("keeps the typed values and shows a toast when adding fails", async () => {
    const user = userEvent.setup();
    vi.mocked(addLoyaltyNumber).mockRejectedValueOnce(new Error("boom"));
    render(<LoyaltySection loyaltyNumbers={[]} />);

    await user.type(screen.getByPlaceholderText("Program name"), "SkyMiles");
    await user.type(screen.getByPlaceholderText("Member #"), "42");
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Could not add loyalty number."));
    expect(screen.getByPlaceholderText("Program name")).toHaveValue("SkyMiles");
    expect(screen.getByPlaceholderText("Member #")).toHaveValue("42");
  });

  it("shows a toast when removing fails", async () => {
    const user = userEvent.setup();
    vi.mocked(deleteLoyaltyNumber).mockRejectedValueOnce(new Error("boom"));
    render(<LoyaltySection loyaltyNumbers={[LOYALTY_NUMBER]} />);

    await user.click(screen.getByRole("button", { name: "Remove Test Airlines" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Could not remove loyalty number."));
  });
});
