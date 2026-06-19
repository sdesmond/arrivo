import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CoverAttributionDialog } from "./cover-attribution-dialog";

describe("CoverAttributionDialog", () => {
  it("renders photographer name and Unsplash link when open", () => {
    render(
      <CoverAttributionDialog
        open
        photographer="Casey Camera"
        photographerUrl="https://unsplash.com/@caseycamera"
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText("Casey Camera")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View on Unsplash" })).toHaveAttribute(
      "href",
      "https://unsplash.com/@caseycamera"
    );
  });

  it("calls onClose from the Close button", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<CoverAttributionDialog open photographer="Casey Camera" onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalled();
  });
});
