// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/app/(app)/trips/[tripId]/actions", () => ({
  uploadCoverImage: vi.fn(),
}));

const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => toastError(...args), success: vi.fn() },
}));

import { CoverImagePickerUpload } from "./cover-image-picker-upload";
import { uploadCoverImage } from "@/app/(app)/trips/[tripId]/actions";

const defaultProps = {
  tripId: "trip-123",
  onImageSelected: vi.fn(),
  onClose: vi.fn(),
};

describe("CoverImagePickerUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders drop zone with associated label element", () => {
    render(<CoverImagePickerUpload {...defaultProps} />);
    expect(screen.getByText(/drop file here or browse/i)).toBeInTheDocument();
    const input = screen.getByLabelText(/drop file here or browse/i);
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("type", "file");
    expect(input).toHaveAttribute("accept", "image/*");
    expect(screen.getByRole("button", { name: /drop file here or browse/i })).toHaveAttribute("tabindex", "0");
  });

  it("file selection triggers uploadCoverImage action call", async () => {
    vi.mocked(uploadCoverImage).mockResolvedValue("https://blob.vercel.dev/image.jpg");
    render(<CoverImagePickerUpload {...defaultProps} />);

    const input = screen.getByLabelText(/drop file here or browse/i);
    const file = new File(["img"], "photo.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(uploadCoverImage).toHaveBeenCalledWith("trip-123", expect.any(FormData)));
  });

  it("calls onImageSelected and onClose on successful upload", async () => {
    vi.mocked(uploadCoverImage).mockResolvedValue("https://blob.vercel.dev/image.jpg");
    render(<CoverImagePickerUpload {...defaultProps} />);

    const input = screen.getByLabelText(/drop file here or browse/i);
    const file = new File(["img"], "photo.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(defaultProps.onImageSelected).toHaveBeenCalledWith("https://blob.vercel.dev/image.jpg"));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("upload failure shows toast.error and keeps picker open", async () => {
    vi.mocked(uploadCoverImage).mockRejectedValue(new Error("Upload failed"));
    render(<CoverImagePickerUpload {...defaultProps} />);

    const input = screen.getByLabelText(/drop file here or browse/i);
    const file = new File(["img"], "photo.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Upload failed. Try again."));
    expect(defaultProps.onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/drop file here or browse/i)).toBeInTheDocument();
  });

  it("invalid file type shows a toast and skips upload", async () => {
    render(<CoverImagePickerUpload {...defaultProps} />);

    const input = screen.getByLabelText(/drop file here or browse/i);
    const file = new File(["pdf"], "notes.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Please choose an image file."));
    expect(uploadCoverImage).not.toHaveBeenCalled();
  });

  it("oversized file shows a toast and skips upload", async () => {
    render(<CoverImagePickerUpload {...defaultProps} />);

    const input = screen.getByLabelText(/drop file here or browse/i);
    const oversized = new File(["img"], "large.png", { type: "image/png" });
    Object.defineProperty(oversized, "size", { value: 25 * 1024 * 1024 + 1 });
    fireEvent.change(input, { target: { files: [oversized] } });

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Cover image exceeds 25 MB limit."));
    expect(uploadCoverImage).not.toHaveBeenCalled();
  });

  it("file selection with no file does not trigger upload", () => {
    render(<CoverImagePickerUpload {...defaultProps} />);
    const input = screen.getByLabelText(/drop file here or browse/i);
    fireEvent.change(input, { target: { files: [] } });
    expect(uploadCoverImage).not.toHaveBeenCalled();
  });

  it("drop event with file triggers upload", async () => {
    vi.mocked(uploadCoverImage).mockResolvedValue("https://blob.vercel.dev/image.jpg");
    render(<CoverImagePickerUpload {...defaultProps} />);

    const label = screen.getByText(/drop file here or browse/i).closest("label")!;
    const file = new File(["img"], "dropped.jpg", { type: "image/jpeg" });
    fireEvent.drop(label, { dataTransfer: { files: [file] } });

    await waitFor(() => expect(uploadCoverImage).toHaveBeenCalledWith("trip-123", expect.any(FormData)));
  });

  it("keyboard activation opens the file picker", () => {
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => undefined);
    render(<CoverImagePickerUpload {...defaultProps} />);

    fireEvent.keyDown(screen.getByRole("button", { name: /drop file here or browse/i }), { key: "Enter" });
    fireEvent.keyDown(screen.getByRole("button", { name: /drop file here or browse/i }), { key: " " });

    expect(clickSpy).toHaveBeenCalledTimes(2);
    clickSpy.mockRestore();
  });

  it("non-activation keys do not open the file picker", () => {
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => undefined);
    render(<CoverImagePickerUpload {...defaultProps} />);

    fireEvent.keyDown(screen.getByRole("button", { name: /drop file here or browse/i }), { key: "Tab" });

    expect(clickSpy).not.toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  it("dragOver applies accent background and dragLeave removes it", () => {
    render(<CoverImagePickerUpload {...defaultProps} />);
    const label = screen.getByText(/drop file here or browse/i).closest("label")!;

    fireEvent.dragOver(label);
    expect(label).toHaveStyle({ background: "var(--accent-soft)" });

    fireEvent.dragLeave(label);
    expect(label).not.toHaveStyle({ background: "var(--accent-soft)" });
  });

  it("drop event with no files does not trigger upload", () => {
    render(<CoverImagePickerUpload {...defaultProps} />);
    const label = screen.getByText(/drop file here or browse/i).closest("label")!;

    fireEvent.drop(label, { dataTransfer: { files: [] } });

    expect(uploadCoverImage).not.toHaveBeenCalled();
  });

  it("shows loading indicator during upload", async () => {
    let resolveUpload: (url: string) => void = () => {};
    vi.mocked(uploadCoverImage).mockReturnValueOnce(
      new Promise((r) => {
        resolveUpload = r;
      })
    );

    render(<CoverImagePickerUpload {...defaultProps} />);

    const input = screen.getByLabelText(/drop file here or browse/i);
    const file = new File(["img"], "photo.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByRole("status", { name: /uploading image/i })).toBeInTheDocument());

    resolveUpload("https://blob.vercel.dev/image.jpg");
    await waitFor(() => expect(defaultProps.onClose).toHaveBeenCalled());
  });
});
