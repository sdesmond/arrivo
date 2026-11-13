import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const { mutate, isPending, endpoints } = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: { value: false },
  endpoints: [] as unknown[],
}));
vi.mock("@/lib/api/use-api-mutation", () => ({
  useApiMutation: (endpoint: unknown) => {
    endpoints.push(endpoint);
    return {
      mutate,
      get isPending() {
        return isPending.value;
      },
      fields: {},
    };
  },
}));

const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => toastError(...args), success: vi.fn() },
}));

import { CoverImagePickerUpload } from "./cover-image-picker-upload";
import { uploadTripCoverImage } from "@/lib/api/contract/covers";

const defaultProps = {
  tripId: "trip-123",
  onClose: vi.fn(),
};

type MutateOptions = { onSuccess?: () => void; onError?: () => void; onAuthLost?: () => void };

describe("CoverImagePickerUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isPending.value = false;
    endpoints.length = 0;
  });

  it("renders drop zone with associated label element", () => {
    render(<CoverImagePickerUpload {...defaultProps} />);
    expect(screen.getByText(/drop file here or browse/i)).toBeInTheDocument();
    expect(screen.getByText("JPG, PNG, WEBP, HEIC, GIF, AVIF · max 12 MB")).toBeInTheDocument();
    const input = screen.getByLabelText(/drop file here or browse/i);
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("type", "file");
    expect(input).toHaveAttribute(
      "accept",
      "image/jpeg,image/png,image/webp,image/heic,image/heif,image/gif,image/avif"
    );
    expect(screen.getByRole("button", { name: /drop file here or browse/i })).toHaveAttribute("tabindex", "0");
  });

  it("uses the cover image upload endpoint", () => {
    render(<CoverImagePickerUpload {...defaultProps} />);
    expect(endpoints).toContain(uploadTripCoverImage);
  });

  it("file selection sends the file with the trip id and an empty body", () => {
    render(<CoverImagePickerUpload {...defaultProps} />);

    const input = screen.getByLabelText(/drop file here or browse/i);
    const file = new File(["img"], "photo.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });

    expect(mutate).toHaveBeenCalledWith(
      { params: { tripId: "trip-123" }, body: {}, file },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) })
    );
  });

  it("accepts a GIF the policy allows", () => {
    render(<CoverImagePickerUpload {...defaultProps} />);
    const file = new File(["GIF89a"], "loop.gif", { type: "image/gif" });
    fireEvent.change(screen.getByLabelText(/drop file here or browse/i), { target: { files: [file] } });
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ file }), expect.anything());
  });

  it("closes the picker once the upload succeeds", () => {
    render(<CoverImagePickerUpload {...defaultProps} />);
    fireEvent.change(screen.getByLabelText(/drop file here or browse/i), {
      target: { files: [new File(["img"], "photo.jpg", { type: "image/jpeg" })] },
    });
    expect(defaultProps.onClose).not.toHaveBeenCalled();

    (mutate.mock.calls[0][1] as MutateOptions).onSuccess?.();
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it("an API failure keeps the picker open with the drop zone ready again; the hook already toasted the message", () => {
    render(<CoverImagePickerUpload {...defaultProps} />);
    fireEvent.change(screen.getByLabelText(/drop file here or browse/i), {
      target: { files: [new File(["img"], "photo.jpg", { type: "image/jpeg" })] },
    });

    (mutate.mock.calls[0][1] as MutateOptions).onError?.();

    expect(defaultProps.onClose).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/drop file here or browse/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/drop file here or browse/i)).toHaveValue("");
  });

  it("closes the picker when the session is lost mid-upload", () => {
    render(<CoverImagePickerUpload {...defaultProps} />);
    fireEvent.change(screen.getByLabelText(/drop file here or browse/i), {
      target: { files: [new File(["img"], "photo.jpg", { type: "image/jpeg" })] },
    });
    (mutate.mock.calls[0][1] as MutateOptions).onAuthLost?.();
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it("invalid file type shows a toast and skips upload", async () => {
    render(<CoverImagePickerUpload {...defaultProps} />);

    const input = screen.getByLabelText(/drop file here or browse/i);
    const file = new File(["pdf"], "notes.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "Unsupported cover image type. Choose JPG, PNG, WEBP, HEIC, GIF, or AVIF."
      )
    );
    expect(mutate).not.toHaveBeenCalled();
  });

  it("oversized file shows a toast and skips upload", async () => {
    render(<CoverImagePickerUpload {...defaultProps} />);

    const input = screen.getByLabelText(/drop file here or browse/i);
    const oversized = new File(["img"], "large.png", { type: "image/png" });
    Object.defineProperty(oversized, "size", { value: 12 * 1024 * 1024 + 1 });
    fireEvent.change(input, { target: { files: [oversized] } });

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Cover image exceeds 12 MB limit."));
    expect(mutate).not.toHaveBeenCalled();
  });

  it("file selection with no file does not trigger upload", () => {
    render(<CoverImagePickerUpload {...defaultProps} />);
    const input = screen.getByLabelText(/drop file here or browse/i);
    fireEvent.change(input, { target: { files: [] } });
    expect(mutate).not.toHaveBeenCalled();
  });

  it("drop event with file triggers upload", () => {
    render(<CoverImagePickerUpload {...defaultProps} />);

    const label = screen.getByText(/drop file here or browse/i).closest("label")!;
    const file = new File(["img"], "dropped.jpg", { type: "image/jpeg" });
    fireEvent.drop(label, { dataTransfer: { files: [file] } });

    expect(mutate).toHaveBeenCalledWith({ params: { tripId: "trip-123" }, body: {}, file }, expect.anything());
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

    expect(mutate).not.toHaveBeenCalled();
  });

  it("shows the loading status instead of the drop zone while the upload is pending", () => {
    isPending.value = true;
    render(<CoverImagePickerUpload {...defaultProps} />);

    expect(screen.getByRole("status", { name: /uploading image/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/drop file here or browse/i)).not.toBeInTheDocument();
  });
});
