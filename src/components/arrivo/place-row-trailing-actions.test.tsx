import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlaceRowTrailingActions } from "./place-row-trailing-actions";
import { TripEditAccessProvider } from "./trip-edit-access";

describe("PlaceRowTrailingActions", () => {
  it("renders the drag handle and a Delete event button", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(<PlaceRowTrailingActions dragHandle={<span data-testid="drag-handle">drag</span>} onDelete={onDelete} />);

    expect(screen.getByTestId("drag-handle")).toBeInTheDocument();
    await user.click(screen.getByTitle("Delete event"));
    expect(onDelete).toHaveBeenCalledOnce();
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
