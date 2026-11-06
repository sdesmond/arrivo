import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SetupLinkResult } from "./setup-link-result";
import { stubPlainHttpClipboard } from "@/test-utils/plain-http-clipboard";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const result = {
  username: "newcomer",
  expiresAt: "2026-10-29T12:00:00.000Z",
  setupUrl: "https://arrivo.example/account-setup/open?token=abc",
};

describe("SetupLinkResult", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
  });

  it("shows the username, expiry and link", () => {
    render(<SetupLinkResult {...result} />);

    expect(screen.getByText("newcomer")).toBeVisible();
    expect(screen.getByText(result.setupUrl)).toBeVisible();
    const expiry = document.querySelector("time");
    expect(expiry).toHaveAttribute("datetime", result.expiresAt);
    expect(expiry).toHaveTextContent(new Date(result.expiresAt).toLocaleString());
  });

  it("copies the link and confirms with the shared toast", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    render(<SetupLinkResult {...result} />);

    await user.click(screen.getByRole("button", { name: "Copy link" }));

    expect(writeText).toHaveBeenCalledWith(result.setupUrl);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Copied to clipboard"));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("copies the link through the fallback when the Clipboard API is unavailable", async () => {
    const user = userEvent.setup();
    const { execCommand, restore } = stubPlainHttpClipboard();
    try {
      render(<SetupLinkResult {...result} />);
      await user.click(screen.getByRole("button", { name: "Copy link" }));
      expect(execCommand).toHaveBeenCalledWith("copy");
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Copied to clipboard"));
    } finally {
      restore();
    }
  });

  it("falls back to manual copy when the clipboard rejects", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
    render(<SetupLinkResult {...result} />);

    await user.click(screen.getByRole("button", { name: "Copy link" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Couldn't copy. Select the link and copy it manually.")
    );
  });
});
