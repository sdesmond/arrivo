import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TripEditCover } from "./trip-edit-cover";

vi.mock("./trip-cover", () => ({
  TripCover: ({ coverImageUrl }: { coverImageUrl?: string }) => (
    <div data-testid="trip-cover-preview" data-url={coverImageUrl ?? ""} />
  ),
}));

vi.mock("./cover-image-picker", () => ({
  CoverImagePicker: ({
    center,
    currentCoverImageUrl,
    onImageSelected,
    onClose,
  }: {
    center?: [number, number];
    currentCoverImageUrl?: string;
    onImageSelected: (url: string) => void;
    onClose: () => void;
  }) => (
    <div
      data-testid="cover-image-picker"
      data-center={center ? center.join(",") : ""}
      data-current-cover-url={currentCoverImageUrl ?? ""}
    >
      <button onClick={() => onImageSelected("https://example.com/new.jpg")}>select-image</button>
      <button onClick={onClose}>close-picker</button>
    </div>
  ),
}));

const baseProps = {
  tripId: "trip-1",
  tripName: "Tokyo Adventure",
  onCoverImageUrlChange: vi.fn(),
};

interface TripEditCoverHarnessProps {
  initialUrl?: string;
  onCoverImageUrlChange?: (url: string | null) => void;
}

function TripEditCoverHarness({ initialUrl, onCoverImageUrlChange = vi.fn() }: TripEditCoverHarnessProps) {
  const [coverImageUrl, setCoverImageUrl] = useState(initialUrl);

  return (
    <TripEditCover
      {...baseProps}
      coverImageUrl={coverImageUrl}
      onCoverImageUrlChange={(url) => {
        setCoverImageUrl(url ?? undefined);
        onCoverImageUrlChange(url);
      }}
    />
  );
}

describe("TripEditCover", () => {
  it("renders TripCover preview", () => {
    render(<TripEditCover {...baseProps} />);
    expect(screen.getByTestId("trip-cover-preview")).toBeInTheDocument();
  });

  it("passes coverImageUrl to TripCover when set", () => {
    render(<TripEditCover {...baseProps} coverImageUrl="https://example.com/cover.jpg" />);
    expect(screen.getByTestId("trip-cover-preview")).toHaveAttribute("data-url", "https://example.com/cover.jpg");
  });

  it("passes empty url to TripCover when coverImageUrl is absent", () => {
    render(<TripEditCover {...baseProps} />);
    expect(screen.getByTestId("trip-cover-preview")).toHaveAttribute("data-url", "");
  });

  it("always shows Edit cover image button", () => {
    render(<TripEditCover {...baseProps} />);
    expect(screen.getByRole("button", { name: "Edit cover image" })).toBeInTheDocument();
  });

  it("does not show Remove image when coverImageUrl is absent", () => {
    render(<TripEditCover {...baseProps} />);
    expect(screen.queryByRole("button", { name: "Remove image" })).not.toBeInTheDocument();
  });

  it("shows Remove image when coverImageUrl is set", () => {
    render(<TripEditCover {...baseProps} coverImageUrl="https://example.com/cover.jpg" />);
    expect(screen.getByRole("button", { name: "Remove image" })).toBeInTheDocument();
  });

  it("disables Edit and Remove buttons when disabled is true", () => {
    render(<TripEditCover {...baseProps} coverImageUrl="https://example.com/cover.jpg" disabled />);
    expect(screen.getByRole("button", { name: "Edit cover image" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove image" })).toBeDisabled();
  });

  it("clicking Edit cover image opens the picker", async () => {
    const user = userEvent.setup();
    render(<TripEditCover {...baseProps} />);
    await user.click(screen.getByRole("button", { name: "Edit cover image" }));
    expect(screen.getByTestId("cover-image-picker")).toBeInTheDocument();
  });

  it("passes center through to the cover picker", async () => {
    const user = userEvent.setup();
    render(<TripEditCover {...baseProps} center={[139.69, 35.68]} />);
    await user.click(screen.getByRole("button", { name: "Edit cover image" }));
    expect(screen.getByTestId("cover-image-picker")).toHaveAttribute("data-center", "139.69,35.68");
  });

  it("passes coverImageUrl through as currentCoverImageUrl to the picker", async () => {
    const user = userEvent.setup();
    render(<TripEditCover {...baseProps} coverImageUrl="graphic:var(--color-amber-400)/dots/mountain" />);
    await user.click(screen.getByRole("button", { name: "Edit cover image" }));
    expect(screen.getByTestId("cover-image-picker")).toHaveAttribute(
      "data-current-cover-url",
      "graphic:var(--color-amber-400)/dots/mountain"
    );
  });

  it("selecting an image calls onCoverImageUrlChange and closes picker", async () => {
    const user = userEvent.setup();
    const onCoverImageUrlChange = vi.fn();
    render(<TripEditCoverHarness onCoverImageUrlChange={onCoverImageUrlChange} />);
    await user.click(screen.getByRole("button", { name: "Edit cover image" }));
    await user.click(screen.getByRole("button", { name: "select-image" }));
    expect(onCoverImageUrlChange).toHaveBeenCalledWith("https://example.com/new.jpg");
    expect(screen.getByTestId("trip-cover-preview")).toHaveAttribute("data-url", "https://example.com/new.jpg");
    expect(screen.queryByTestId("cover-image-picker")).not.toBeInTheDocument();
  });

  it("clicking Remove image calls onCoverImageUrlChange(null) and hides the button", async () => {
    const user = userEvent.setup();
    const onCoverImageUrlChange = vi.fn();
    render(
      <TripEditCoverHarness initialUrl="https://example.com/cover.jpg" onCoverImageUrlChange={onCoverImageUrlChange} />
    );
    await user.click(screen.getByRole("button", { name: "Remove image" }));
    expect(onCoverImageUrlChange).toHaveBeenCalledWith(null);
    expect(screen.getByTestId("trip-cover-preview")).toHaveAttribute("data-url", "");
    expect(screen.queryByRole("button", { name: "Remove image" })).not.toBeInTheDocument();
  });
});
