import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlaceRowNameField } from "./place-row-name-field";
import { TripEditAccessProvider } from "./trip-edit-access";

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

  it("calls onStartEdit when display name is clicked", async () => {
    const user = userEvent.setup();
    const onStartEdit = vi.fn();
    render(<PlaceRowNameField {...defaultProps} onStartEdit={onStartEdit} />);
    await user.click(screen.getByText("Tokyo Tower"));
    expect(onStartEdit).toHaveBeenCalledOnce();
  });

  it("calls onStartEdit when Enter key is pressed on display name", () => {
    const onStartEdit = vi.fn();
    render(<PlaceRowNameField {...defaultProps} onStartEdit={onStartEdit} />);
    fireEvent.keyDown(screen.getByText("Tokyo Tower"), { key: "Enter" });
    expect(onStartEdit).toHaveBeenCalledOnce();
  });

  it("calls onStartEdit when Space key is pressed on display name", () => {
    const onStartEdit = vi.fn();
    render(<PlaceRowNameField {...defaultProps} onStartEdit={onStartEdit} />);
    fireEvent.keyDown(screen.getByText("Tokyo Tower"), { key: " " });
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

describe("PlaceRowNameField for a viewer", () => {
  it("shows the name as plain text that never enters edit mode", async () => {
    const user = userEvent.setup();
    const onStartEdit = vi.fn();
    render(
      <TripEditAccessProvider canEdit={false}>
        <PlaceRowNameField {...defaultProps} onStartEdit={onStartEdit} />
      </TripEditAccessProvider>
    );

    expect(screen.queryByRole("button", { name: "Tokyo Tower" })).not.toBeInTheDocument();
    await user.click(screen.getByText("Tokyo Tower"));
    fireEvent.keyDown(screen.getByText("Tokyo Tower"), { key: "Enter" });
    expect(onStartEdit).not.toHaveBeenCalled();
  });
});
