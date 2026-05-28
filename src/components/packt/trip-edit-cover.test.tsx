// @vitest-environment jsdom
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TripEditCover } from "./trip-edit-cover";

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ alt, onError }: { alt: string; onError?: () => void }) => <img alt={alt} onError={onError} />,
}));

interface TripEditCoverHarnessProps {
  initialUrl?: string;
  disabled?: boolean;
  onCoverImageUrlChange?: (url: string | undefined) => void;
}

function TripEditCoverHarness({
  initialUrl,
  disabled = false,
  onCoverImageUrlChange = vi.fn(),
}: TripEditCoverHarnessProps) {
  const [coverImageUrl, setCoverImageUrl] = useState(initialUrl);

  return (
    <TripEditCover
      tripName="Tokyo Adventure"
      coverImageUrl={coverImageUrl}
      onCoverImageUrlChange={(url) => {
        setCoverImageUrl(url);
        onCoverImageUrlChange(url);
      }}
      disabled={disabled}
    />
  );
}

describe("TripEditCover", () => {
  it("renders the image url input", () => {
    render(<TripEditCoverHarness />);

    expect(screen.getByPlaceholderText("https://…")).toBeInTheDocument();
  });

  it("renders the cover preview when the url is set", () => {
    render(<TripEditCoverHarness initialUrl="https://example.com/cover.jpg" />);

    expect(screen.getByRole("img", { name: "Tokyo Adventure" })).toBeInTheDocument();
  });

  it("does not render the cover preview when the url is absent", () => {
    render(<TripEditCoverHarness />);

    expect(screen.queryByRole("img", { name: "Tokyo Adventure" })).not.toBeInTheDocument();
  });

  it("calls onCoverImageUrlChange when the input changes", async () => {
    const user = userEvent.setup();
    const onCoverImageUrlChange = vi.fn();
    render(<TripEditCoverHarness onCoverImageUrlChange={onCoverImageUrlChange} />);

    await user.type(screen.getByPlaceholderText("https://…"), "https://example.com/cover.jpg");

    expect(onCoverImageUrlChange).toHaveBeenLastCalledWith("https://example.com/cover.jpg");
  });

  it("disables the input when disabled is true", () => {
    render(<TripEditCoverHarness initialUrl="https://example.com/cover.jpg" disabled />);

    expect(screen.getByPlaceholderText("https://…")).toBeDisabled();
  });

  it("resets the image error when the url changes to a new value", async () => {
    const user = userEvent.setup();
    render(<TripEditCoverHarness initialUrl="https://example.com/broken.jpg" />);

    fireEvent.error(screen.getByRole("img", { name: "Tokyo Adventure" }));
    expect(screen.queryByRole("img", { name: "Tokyo Adventure" })).not.toBeInTheDocument();

    await user.clear(screen.getByPlaceholderText("https://…"));
    await user.type(screen.getByPlaceholderText("https://…"), "https://example.com/good.jpg");
    expect(screen.getByRole("img", { name: "Tokyo Adventure" })).toBeInTheDocument();
  });
});
