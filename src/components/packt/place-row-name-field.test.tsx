import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlaceRowNameField } from "./place-row-name-field";

const defaultProps = {
  isEditingName: false,
  draftName: "Tokyo Tower",
  onDraftChange: vi.fn(),
  onBlur: vi.fn(),
  onKeyDown: vi.fn(),
  displayName: "Tokyo Tower",
  isHovered: false,
  onStartEdit: vi.fn(),
};

describe("PlaceRowNameField", () => {
  it("renders display name when not editing", () => {
    render(<PlaceRowNameField {...defaultProps} />);
    expect(screen.getByText("Tokyo Tower")).toBeInTheDocument();
  });

  it("renders input when editing", () => {
    render(<PlaceRowNameField {...defaultProps} isEditingName draftName="Tokyo Tower" />);
    expect(screen.getByDisplayValue("Tokyo Tower")).toBeInTheDocument();
  });

  it("shows edit button with title when not editing", () => {
    render(<PlaceRowNameField {...defaultProps} />);
    expect(screen.getByTitle("Edit name")).toBeInTheDocument();
  });

  it("calls onStartEdit when edit button is clicked", async () => {
    const user = userEvent.setup();
    const onStartEdit = vi.fn();
    render(<PlaceRowNameField {...defaultProps} onStartEdit={onStartEdit} />);
    await user.click(screen.getByTitle("Edit name"));
    expect(onStartEdit).toHaveBeenCalledOnce();
  });

  it("calls onBlur when input loses focus", () => {
    const onBlur = vi.fn();
    render(<PlaceRowNameField {...defaultProps} isEditingName onBlur={onBlur} />);
    fireEvent.blur(screen.getByDisplayValue("Tokyo Tower"));
    expect(onBlur).toHaveBeenCalledOnce();
  });

  it("calls onKeyDown on key press in input", async () => {
    const user = userEvent.setup();
    const onKeyDown = vi.fn();
    render(<PlaceRowNameField {...defaultProps} isEditingName onKeyDown={onKeyDown} />);
    await user.keyboard("{Enter}");
    expect(onKeyDown).toHaveBeenCalled();
  });

  it("calls onDraftChange when input value changes", async () => {
    const user = userEvent.setup();
    const onDraftChange = vi.fn();
    render(<PlaceRowNameField {...defaultProps} isEditingName draftName="" onDraftChange={onDraftChange} />);
    await user.type(screen.getByRole("textbox"), "A");
    expect(onDraftChange).toHaveBeenCalled();
  });

  it("shows placeholder when isDraft is true and editing", () => {
    render(<PlaceRowNameField {...defaultProps} isEditingName isDraft draftName="" />);
    expect(screen.getByPlaceholderText("Event name")).toBeInTheDocument();
  });
});
