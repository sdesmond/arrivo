import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({
    children,
    open,
    onOpenChange,
  }: {
    children: React.ReactNode;
    open: boolean;
    onOpenChange?: (v: boolean) => void;
  }) =>
    open ? (
      <>
        {children}
        <button data-testid="dialog-escape" onClick={() => onOpenChange?.(false)} />
      </>
    ) : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/lib/api/client", async (original) => ({
  ...(await original<typeof import("@/lib/api/client")>()),
  api: vi.fn(),
}));

const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
  },
}));

import { DeleteEventDialog } from "./delete-event-dialog";
import { api, ApiClientError } from "@/lib/api/client";

const defaultProps = {
  eventId: "ev-1",
  tripId: "trip-1",
  eventName: "Museum Visit",
  docCount: 2,
  open: true,
  onOpenChange: vi.fn(),
};

describe("DeleteEventDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api).mockResolvedValue(null);
  });

  describe("rendering", () => {
    it("shows event name in the title", () => {
      render(<DeleteEventDialog {...defaultProps} />);
      expect(screen.getByText("Delete Museum Visit?")).toBeInTheDocument();
    });

    it("shows correct plural doc count in the message", () => {
      render(<DeleteEventDialog {...defaultProps} />);
      expect(screen.getByText(/2 attached documents/)).toBeInTheDocument();
    });

    it("shows correct singular doc count in the message", () => {
      render(<DeleteEventDialog {...defaultProps} docCount={1} />);
      expect(screen.getByText(/1 attached document[^s]/)).toBeInTheDocument();
    });

    it("renders Keep documents, Delete everything, and Cancel buttons", () => {
      render(<DeleteEventDialog {...defaultProps} />);
      expect(screen.getByRole("button", { name: /keep documents/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /delete everything/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
    });

    it("does not render when open is false", () => {
      render(<DeleteEventDialog {...defaultProps} open={false} />);
      expect(screen.queryByText("Delete Museum Visit?")).not.toBeInTheDocument();
    });
  });

  describe("focus management", () => {
    it("Keep documents button receives focus on open", async () => {
      render(<DeleteEventDialog {...defaultProps} />);
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /keep documents/i })).toHaveFocus();
      });
    });
  });

  describe("Keep documents path", () => {
    it("deletes through the API with the trip and keepDocuments true", async () => {
      const user = userEvent.setup();
      render(<DeleteEventDialog {...defaultProps} />);
      await user.click(screen.getByRole("button", { name: /keep documents/i }));
      expect(api).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ method: "DELETE", path: "/api/v1/events/:eventId" }),
        { params: { eventId: "ev-1" }, body: { tripId: "trip-1", keepDocuments: true } }
      );
    });

    it("closes the dialog after the API call resolves", async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      render(<DeleteEventDialog {...defaultProps} onOpenChange={onOpenChange} />);
      await user.click(screen.getByRole("button", { name: /keep documents/i }));
      await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    });

    it("does not close the dialog and shows the API error when the call fails", async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      vi.mocked(api).mockRejectedValueOnce(new ApiClientError(500, "server_error", "boom"));
      render(<DeleteEventDialog {...defaultProps} onOpenChange={onOpenChange} />);
      await user.click(screen.getByRole("button", { name: /keep documents/i }));
      await waitFor(() => expect(toastError).toHaveBeenCalledWith("boom"));
      expect(onOpenChange).not.toHaveBeenCalled();
    });
  });

  describe("Delete everything path", () => {
    it("deletes through the API with the trip and keepDocuments false", async () => {
      const user = userEvent.setup();
      render(<DeleteEventDialog {...defaultProps} />);
      await user.click(screen.getByRole("button", { name: /delete everything/i }));
      expect(api).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ method: "DELETE", path: "/api/v1/events/:eventId" }),
        { params: { eventId: "ev-1" }, body: { tripId: "trip-1", keepDocuments: false } }
      );
    });

    it("closes the dialog after the API call resolves", async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      render(<DeleteEventDialog {...defaultProps} onOpenChange={onOpenChange} />);
      await user.click(screen.getByRole("button", { name: /delete everything/i }));
      await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    });

    it("does not close the dialog and shows the API error when the call fails", async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      vi.mocked(api).mockRejectedValueOnce(new ApiClientError(500, "server_error", "boom"));
      render(<DeleteEventDialog {...defaultProps} onOpenChange={onOpenChange} />);
      await user.click(screen.getByRole("button", { name: /delete everything/i }));
      await waitFor(() => expect(toastError).toHaveBeenCalledWith("boom"));
      expect(onOpenChange).not.toHaveBeenCalled();
    });
  });

  describe("Cancel path", () => {
    it("does not call the API when Cancel is clicked", async () => {
      const user = userEvent.setup();
      render(<DeleteEventDialog {...defaultProps} />);
      await user.click(screen.getByRole("button", { name: /cancel/i }));
      expect(api).not.toHaveBeenCalled();
    });

    it("calls onOpenChange(false) when Cancel is clicked", async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      render(<DeleteEventDialog {...defaultProps} onOpenChange={onOpenChange} />);
      await user.click(screen.getByRole("button", { name: /cancel/i }));
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("Escape (dialog close) calls onOpenChange(false) without action", async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      render(<DeleteEventDialog {...defaultProps} onOpenChange={onOpenChange} />);
      await user.click(screen.getByTestId("dialog-escape"));
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(api).not.toHaveBeenCalled();
    });
  });

  describe("edge cases", () => {
    it("uses 'it' pronoun when docCount is 1", () => {
      render(<DeleteEventDialog {...defaultProps} docCount={1} />);
      expect(screen.getByText(/with it\?/)).toBeInTheDocument();
    });

    it("uses 'them' pronoun when docCount is 2", () => {
      render(<DeleteEventDialog {...defaultProps} docCount={2} />);
      expect(screen.getByText(/with them\?/)).toBeInTheDocument();
    });

    it("renders with zero documents", () => {
      render(<DeleteEventDialog {...defaultProps} docCount={0} />);
      expect(screen.getByText(/0 attached documents/)).toBeInTheDocument();
      expect(screen.getByText(/with them\?/)).toBeInTheDocument();
    });
  });
});
