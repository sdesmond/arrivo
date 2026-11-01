import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SetupLinkResult } from "./setup-link-result";

const result = {
  username: "newcomer",
  expiresAt: "2026-10-29T12:00:00.000Z",
  setupUrl: "https://arrivo.example/account-setup/open?token=abc",
};

describe("SetupLinkResult", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the username, expiry and link", () => {
    render(<SetupLinkResult {...result} />);

    expect(screen.getByText("newcomer")).toBeVisible();
    expect(screen.getByText(result.setupUrl)).toBeVisible();
    const expiry = document.querySelector("time");
    expect(expiry).toHaveAttribute("datetime", result.expiresAt);
    expect(expiry).toHaveTextContent(new Date(result.expiresAt).toLocaleString());
  });

  it("copies the link and confirms", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    render(<SetupLinkResult {...result} />);

    await user.click(screen.getByRole("button", { name: "Copy link" }));

    expect(writeText).toHaveBeenCalledWith(result.setupUrl);
    expect(await screen.findByText("Link copied.")).toBeVisible();
  });

  it("falls back to manual copy when the clipboard rejects", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
    render(<SetupLinkResult {...result} />);

    await user.click(screen.getByRole("button", { name: "Copy link" }));

    expect(await screen.findByText("Couldn't copy. Select the link and copy it manually.")).toBeVisible();
  });
});
