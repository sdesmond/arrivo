// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => toastError(...args), success: vi.fn() },
}));

import { CoverImagePickerUrl } from "./cover-image-picker-url";

const defaultProps = {
  onImageSelected: vi.fn(),
  onClose: vi.fn(),
};

describe("CoverImagePickerUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders text input and Apply button", () => {
    render(<CoverImagePickerUrl {...defaultProps} />);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /apply/i })).toBeInTheDocument();
  });

  it("Apply button is disabled when URL input is empty", () => {
    render(<CoverImagePickerUrl {...defaultProps} />);
    expect(screen.getByRole("button", { name: /apply/i })).toBeDisabled();
  });

  it("Apply button is enabled when URL input has text", async () => {
    const user = userEvent.setup();
    render(<CoverImagePickerUrl {...defaultProps} />);

    await user.type(screen.getByRole("textbox"), "https://example.com/image.jpg");
    expect(screen.getByRole("button", { name: /apply/i })).toBeEnabled();
  });

  it("Apply with valid URL calls onImageSelected with trimmed URL and onClose", async () => {
    const user = userEvent.setup();
    render(<CoverImagePickerUrl {...defaultProps} />);

    await user.type(screen.getByRole("textbox"), "  https://example.com/image.jpg  ");
    await user.click(screen.getByRole("button", { name: /apply/i }));

    expect(defaultProps.onImageSelected).toHaveBeenCalledWith("https://example.com/image.jpg");
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("shows a toast for an invalid URL", async () => {
    const user = userEvent.setup();
    render(<CoverImagePickerUrl {...defaultProps} />);

    await user.type(screen.getByRole("textbox"), "not-a-url");
    await user.click(screen.getByRole("button", { name: /apply/i }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Please enter a valid URL."));
    expect(defaultProps.onImageSelected).not.toHaveBeenCalled();
    expect(defaultProps.onClose).not.toHaveBeenCalled();
  });

  it("rejects javascript: URIs", async () => {
    const user = userEvent.setup();
    render(<CoverImagePickerUrl {...defaultProps} />);

    await user.type(screen.getByRole("textbox"), "javascript:alert('xss')");
    await user.click(screen.getByRole("button", { name: /apply/i }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Please enter a valid URL."));
    expect(defaultProps.onImageSelected).not.toHaveBeenCalled();
  });
});
