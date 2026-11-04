import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WishlistSection } from "./wishlist-section";
import { deleteWishlistDestination } from "./actions";

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
