import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlaceRowTrailingActions } from "./place-row-trailing-actions";
import { TripEditAccessProvider } from "./trip-edit-access";
import { IconSize } from "@/lib/size-tokens";

describe("PlaceRowTrailingActions", () => {
  it("renders only a Delete event button that calls onDelete", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(<PlaceRowTrailingActions onDelete={onDelete} />);

    expect(screen.getAllByRole("button")).toHaveLength(1);
    await user.click(screen.getByTitle("Delete event"));
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it("gives Delete a 44px target revealed on hover or keyboard focus", async () => {
    const user = userEvent.setup();
    render(<PlaceRowTrailingActions onDelete={vi.fn()} />);
    const deleteButton = screen.getByTitle("Delete event");

    expect(deleteButton.parentElement).toHaveClass(
      "opacity-100",
      "sm:opacity-0",
      "sm:group-hover:opacity-100",
      "sm:focus-within:opacity-100"
    );
    expect(deleteButton).toHaveClass("size-11", "items-center", "justify-center");
    expect(deleteButton.querySelector("svg")).toHaveAttribute("width", String(IconSize.rowAction));
    await user.tab();
    expect(deleteButton).toHaveFocus();
  });

  it("renders nothing for a viewer", () => {
    const { container } = render(
      <TripEditAccessProvider canEdit={false}>
        <PlaceRowTrailingActions onDelete={vi.fn()} />
      </TripEditAccessProvider>
    );
    expect(container).toBeEmptyDOMElement();
  });
});
