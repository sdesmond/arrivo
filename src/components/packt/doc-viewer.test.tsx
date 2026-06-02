import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Document } from "@/data/types";

vi.mock("@/lib/use-is-mobile");

vi.mock("@/lib/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/utils")>();
  return { ...actual, shareDoc: vi.fn().mockResolvedValue(undefined) };
});

vi.mock("@base-ui/react/dialog", () => ({
  Dialog: {
    Popup: ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
      <div data-testid="doc-viewer-popup" style={style}>
        {children}
      </div>
    ),
  },
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({
    children,
    open,
    onOpenChange,
  }: {
    children: React.ReactNode;
    open: boolean;
    onOpenChange?: (o: boolean) => void;
  }) =>
    open ? (
      <>
        {children}
        <button data-testid="dialog-backdrop-close" onClick={() => onOpenChange?.(false)} />
      </>
    ) : null,
  DialogPortal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogOverlay: () => null,
  DialogClose: ({
    children,
    render: renderProp,
  }: {
    children: React.ReactNode;
    render?: React.ReactElement<React.HTMLAttributes<HTMLButtonElement>>;
  }) => {
    if (renderProp) {
      const originalOnClick = renderProp.props.onClick;
      const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
        originalOnClick?.(event);
        const backdrop = document.querySelector<HTMLButtonElement>('[data-testid="dialog-backdrop-close"]');
        backdrop?.click();
      };
      return React.cloneElement(renderProp, { onClick: handleClick }, children);
    }
    return <button>{children}</button>;
  },
}));

import { useIsMobile } from "@/lib/use-is-mobile";
import { shareDoc } from "@/lib/utils";
import { DocViewer } from "./doc-viewer";

const makeDoc = (overrides: Partial<Document> = {}): Document => ({
  id: "doc-1",
  name: "Boarding Pass.pdf",
  kind: "pdf",
  scope: "trip",
  offline: false,
  url: "https://example.com/default.pdf",
  ...overrides,
});

describe("DocViewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useIsMobile).mockReturnValue(false);
  });

  it("does not render when open is false", () => {
    const onClose = vi.fn();
    render(<DocViewer doc={makeDoc()} open={false} onClose={onClose} />);
    expect(screen.queryByTestId("doc-viewer-popup")).not.toBeInTheDocument();
  });

  it("renders the popup when open is true", () => {
    render(<DocViewer doc={makeDoc()} open={true} onClose={vi.fn()} />);
    expect(screen.getByTestId("doc-viewer-popup")).toBeInTheDocument();
  });

  it("shows the document name in the header", () => {
    render(<DocViewer doc={makeDoc({ name: "My Visa.pdf" })} open={true} onClose={vi.fn()} />);
    expect(screen.getByText("My Visa.pdf")).toBeInTheDocument();
  });

  it("close button has correct title and aria-label", () => {
    render(<DocViewer doc={makeDoc()} open={true} onClose={vi.fn()} />);
    const closeBtn = screen.getByRole("button", { name: "Close viewer" });
    expect(closeBtn).toHaveAttribute("title", "Close viewer");
    expect(closeBtn).toHaveAttribute("aria-label", "Close viewer");
  });

  it("close button has min 44px touch target", () => {
    render(<DocViewer doc={makeDoc()} open={true} onClose={vi.fn()} />);
    const closeBtn = screen.getByRole("button", { name: "Close viewer" });
    expect(closeBtn).toHaveStyle({ minWidth: "44px", minHeight: "44px" });
  });

  it("share button has correct title and aria-label", () => {
    render(<DocViewer doc={makeDoc({ name: "boarding-pass.pdf" })} open={true} onClose={vi.fn()} />);
    const shareBtn = screen.getByRole("button", { name: "Share boarding-pass.pdf" });
    expect(shareBtn).toHaveAttribute("title", "Share boarding-pass.pdf");
    expect(shareBtn).toHaveAttribute("aria-label", "Share boarding-pass.pdf");
  });

  it("share button has min 44px touch target", () => {
    render(<DocViewer doc={makeDoc()} open={true} onClose={vi.fn()} />);
    const shareBtn = screen.getByRole("button", { name: "Share Boarding Pass.pdf" });
    expect(shareBtn).toHaveStyle({ minWidth: "44px", minHeight: "44px" });
  });

  it("clicking the share button calls shareDoc with the doc", async () => {
    const user = userEvent.setup();
    const doc = makeDoc({ name: "My Doc.pdf", url: "https://example.com/my-doc.pdf" });
    render(<DocViewer doc={doc} open={true} onClose={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Share My Doc.pdf" }));
    expect(shareDoc).toHaveBeenCalledWith(expect.objectContaining({ name: "My Doc.pdf" }));
  });

  it("calls onClose when the backdrop close is triggered", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<DocViewer doc={makeDoc()} open={true} onClose={onClose} />);
    await user.click(screen.getByTestId("dialog-backdrop-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the production close button is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<DocViewer doc={makeDoc()} open={true} onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Close viewer" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("applies full-screen inset style when on mobile", () => {
    vi.mocked(useIsMobile).mockReturnValue(true);
    render(<DocViewer doc={makeDoc()} open={true} onClose={vi.fn()} />);
    const popup = screen.getByTestId("doc-viewer-popup");
    expect(popup).toHaveStyle({ position: "fixed", inset: "0" });
  });

  it("renders an img for kind image", () => {
    render(
      <DocViewer doc={makeDoc({ kind: "image", url: "https://example.com/photo.jpg" })} open={true} onClose={vi.fn()} />
    );
    const img = screen.getByRole("img", { name: "Boarding Pass.pdf" });
    expect(img).toHaveAttribute("src", "https://example.com/photo.jpg");
    expect(img).toHaveStyle({ objectFit: "contain" });
  });

  it("renders an iframe for kind pdf on non-mobile-Safari", () => {
    render(
      <DocViewer doc={makeDoc({ kind: "pdf", url: "https://example.com/doc.pdf" })} open={true} onClose={vi.fn()} />
    );
    const iframe = document.querySelector("iframe");
    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute("src", "https://example.com/doc.pdf");
    expect(iframe).toHaveAttribute("title", "Boarding Pass.pdf");
  });

  it("applies sandbox to iframe when URL is cross-origin", async () => {
    render(
      <DocViewer
        doc={makeDoc({ kind: "pdf", url: "https://other-host.example.com/doc.pdf" })}
        open={true}
        onClose={vi.fn()}
      />
    );
    await waitFor(() => {
      const iframe = document.querySelector("iframe");
      expect(iframe).toHaveAttribute("sandbox", "");
    });
  });

  it("does not sandbox iframe for same-origin relative URL", async () => {
    render(<DocViewer doc={makeDoc({ kind: "pdf", url: "/uploads/local.pdf" })} open={true} onClose={vi.fn()} />);
    await waitFor(() => {
      const iframe = document.querySelector("iframe");
      expect(iframe).not.toHaveAttribute("sandbox");
    });
  });

  it("renders an Open PDF link for kind pdf on mobile Safari", async () => {
    const ORIGINAL_UA = navigator.userAgent;
    try {
      Object.defineProperty(navigator, "userAgent", {
        value:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        configurable: true,
      });
      render(
        <DocViewer doc={makeDoc({ kind: "pdf", url: "https://example.com/doc.pdf" })} open={true} onClose={vi.fn()} />
      );
      await waitFor(() => {
        expect(screen.getByRole("link", { name: "Open PDF" })).toHaveAttribute("href", "https://example.com/doc.pdf");
      });
    } finally {
      Object.defineProperty(navigator, "userAgent", {
        value: ORIGINAL_UA,
        configurable: true,
      });
    }
  });

  it("renders a Download link for kind doc", () => {
    render(
      <DocViewer
        doc={makeDoc({ kind: "doc", url: "https://example.com/file.docx", name: "Itinerary.docx" })}
        open={true}
        onClose={vi.fn()}
      />
    );
    const link = screen.getByRole("link", { name: "Download" });
    expect(link).toHaveAttribute("href", "https://example.com/file.docx");
    expect(link).toHaveAttribute("download", "Itinerary.docx");
  });

  describe("Wake Lock", () => {
    afterEach(() => {
      try {
        delete (navigator as unknown as Record<string, unknown>).wakeLock;
      } catch {}
    });

    it("does not throw when navigator.wakeLock is unavailable", () => {
      expect(() => {
        render(<DocViewer doc={makeDoc()} open={true} onClose={vi.fn()} />);
      }).not.toThrow();
    });

    it("requests a screen wake lock when viewer opens", async () => {
      const mockRelease = vi.fn().mockResolvedValue(undefined);
      const mockRequest = vi.fn().mockResolvedValue({ release: mockRelease, type: "screen" });
      Object.defineProperty(navigator, "wakeLock", {
        value: { request: mockRequest },
        configurable: true,
      });

      render(<DocViewer doc={makeDoc()} open={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(mockRequest).toHaveBeenCalledWith("screen");
      });
    });

    it("releases wake lock when viewer closes (open → false)", async () => {
      const mockRelease = vi.fn().mockResolvedValue(undefined);
      const mockRequest = vi.fn().mockResolvedValue({ release: mockRelease, type: "screen" });
      Object.defineProperty(navigator, "wakeLock", {
        value: { request: mockRequest },
        configurable: true,
      });

      const { rerender } = render(<DocViewer doc={makeDoc()} open={true} onClose={vi.fn()} />);
      await waitFor(() => expect(mockRequest).toHaveBeenCalledWith("screen"));

      rerender(<DocViewer doc={makeDoc()} open={false} onClose={vi.fn()} />);
      await waitFor(() => expect(mockRelease).toHaveBeenCalled());
    });

    it("silently catches wake lock request errors", async () => {
      Object.defineProperty(navigator, "wakeLock", {
        value: { request: vi.fn().mockRejectedValue(new DOMException("NotAllowed")) },
        configurable: true,
      });

      expect(() => {
        render(<DocViewer doc={makeDoc()} open={true} onClose={vi.fn()} />);
      }).not.toThrow();
    });
  });

  it("shows fallback message when doc.url is undefined", () => {
    render(<DocViewer doc={makeDoc({ kind: "image", url: undefined })} open={true} onClose={vi.fn()} />);
    expect(screen.getByText("Document is not available")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Boarding Pass.pdf" })).not.toBeInTheDocument();
  });

  it("rejects unsafe URL schemes (javascript:)", () => {
    render(<DocViewer doc={makeDoc({ kind: "pdf", url: "javascript:alert(1)" })} open={true} onClose={vi.fn()} />);
    expect(screen.getByText("Document is not available")).toBeInTheDocument();
    expect(document.querySelector("iframe")).not.toBeInTheDocument();
  });

  it("rejects data: URLs", () => {
    render(
      <DocViewer
        doc={makeDoc({ kind: "image", url: "data:text/html,<script>alert(1)</script>" })}
        open={true}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("Document is not available")).toBeInTheDocument();
  });
});
