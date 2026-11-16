import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlaceRowTrailingActions } from "./place-row-trailing-actions";
import { TripEditAccessProvider } from "./trip-edit-access";
import { IconSize } from "@/lib/size-tokens";

describe("PlaceRowTrailingActions", () => {
  it("renders the drag handle and a Delete event button", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(<PlaceRowTrailingActions dragHandle={<span data-testid="drag-handle">drag</span>} onDelete={onDelete} />);

    expect(screen.getByTestId("drag-handle")).toBeInTheDocument();
    await user.click(screen.getByTitle("Delete event"));
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it("centres the drag handle and delete button in one group with 44px targets", () => {
    render(<PlaceRowTrailingActions dragHandle={<span data-testid="drag-handle">drag</span>} onDelete={vi.fn()} />);
    const deleteButton = screen.getByTitle("Delete event");
    const group = deleteButton.parentElement as HTMLElement;

    expect(group).toHaveClass("flex", "items-center", "sm:focus-within:opacity-100");
    expect(screen.getByTestId("drag-handle").parentElement).toBe(group);
    expect(deleteButton).toHaveClass("size-11", "items-center", "justify-center");
    expect(deleteButton.querySelector("svg")).toHaveAttribute("width", String(IconSize.rowAction));
  });

  it("omits the drag handle wrapper when no handle is given", () => {
    render(<PlaceRowTrailingActions onDelete={vi.fn()} />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("renders nothing for a viewer", () => {
    const { container } = render(
      <TripEditAccessProvider canEdit={false}>
        <PlaceRowTrailingActions dragHandle={<span data-testid="drag-handle">drag</span>} onDelete={vi.fn()} />
      </TripEditAccessProvider>
    );
    expect(container).toBeEmptyDOMElement();
  });
});
