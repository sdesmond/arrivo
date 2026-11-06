import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WishlistSection } from "./wishlist-section";
import { toast } from "sonner";
import { FIELD_LIMITS } from "@/lib/validation-limits";
import { addWishlistDestination, deleteWishlistDestination } from "./actions";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("./actions", () => ({
  addWishlistDestination: vi.fn(),
  deleteWishlistDestination: vi.fn(),
}));

describe("WishlistSection icon controls", () => {
  it("provides a 44px remove target that still deletes the destination", async () => {
    const user = userEvent.setup();
    render(<WishlistSection wishlistDestinations={[{ id: "destination-1", name: "Kyoto", position: 0 }]} />);
    const remove = screen.getByRole("button", { name: "Remove" });
    expect(remove).toHaveClass("size-11", "shrink-0");
    expect(remove).toHaveAttribute("title", "Remove");
    await user.click(remove);
    expect(deleteWishlistDestination).toHaveBeenCalledWith("destination-1");
  });
});

describe("WishlistSection adding", () => {
  it("caps the destination at the shared wishlist limit", () => {
    render(<WishlistSection wishlistDestinations={[]} />);
    expect(screen.getByPlaceholderText("e.g. Kyoto, Japan")).toHaveAttribute(
      "maxLength",
      String(FIELD_LIMITS.wishlistDestination)
    );
  });

  it("keeps the typed destination and shows a toast when adding fails", async () => {
    const user = userEvent.setup();
    vi.mocked(addWishlistDestination).mockRejectedValueOnce(new Error("boom"));
    render(<WishlistSection wishlistDestinations={[]} />);

    await user.type(screen.getByPlaceholderText("e.g. Kyoto, Japan"), "Lisbon");
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Could not add destination."));
    expect(screen.getByPlaceholderText("e.g. Kyoto, Japan")).toHaveValue("Lisbon");
  });

  it("shows a toast when removing fails", async () => {
    const user = userEvent.setup();
    vi.mocked(deleteWishlistDestination).mockRejectedValueOnce(new Error("boom"));
    render(<WishlistSection wishlistDestinations={[{ id: "destination-1", name: "Kyoto", position: 0 }]} />);

    await user.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Could not remove destination."));
  });
});
