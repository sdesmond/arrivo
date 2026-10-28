import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as navigation from "next/navigation";
const { generate, check, notify } = vi.hoisted(() => ({ generate: vi.fn(), check: vi.fn(), notify: vi.fn() }));
vi.mock("sonner", () => ({ toast: { info: notify } }));
vi.mock("@/app/(app)/admin/users/actions", () => ({
  regenerateSetupLinkAction: generate,
  checkSetupLinkTargetAction: check,
}));
import { RegenerateSetupLinkDialog } from "./regenerate-setup-link-dialog";
const success = {
  ok: true,
  userId: "target",
  username: "pending",
  setupUrl: "https://arrivo.example/account-setup/open?token=sample",
  expiresAt: "2026-10-29T12:00:00.000Z",
};
describe("RegenerateSetupLinkDialog", () => {
  const refresh = vi.fn();
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(navigation, "useRouter").mockReturnValue({ ...navigation.useRouter(), refresh });
    generate.mockResolvedValue(success);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });
  async function open() {
    render(<RegenerateSetupLinkDialog userId="target" username="pending" />);
    const user = userEvent.setup();
    screen.getByRole("button", { name: "Generate new link: pending" }).focus();
    await user.keyboard("{Enter}");
    return user;
  }
  async function submit() {
    const user = await open();
    await user.click(screen.getByRole("button", { name: "Generate new link" }));
    return user;
  }
  it("opens by keyboard without issuing, and Escape returns focus", async () => {
    const user = await open();
    expect(generate).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.getByRole("button", { name: "Generate new link: pending" })).toHaveFocus());
  });
  it("cancels without generation and restores trigger focus", async () => {
    const user = await open();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Generate new link: pending" })).toHaveFocus());
    expect(generate).not.toHaveBeenCalled();
  });
  it("focuses one-time result, refreshes Users, copies and clears URL on close", async () => {
    const user = await submit();
    const heading = await screen.findByRole("heading", { name: "New setup link ready" });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(generate).toHaveBeenCalledWith("target");
    expect(refresh).toHaveBeenCalledOnce();
    expect(screen.getByText(success.setupUrl)).toHaveClass("select-text");
    const copy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    await user.click(screen.getByRole("button", { name: "Copy link" }));
    expect(copy).toHaveBeenCalledWith(success.setupUrl);
    expect(screen.getByRole("status")).toHaveTextContent("Link copied.");
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Generate new link: pending" }));
    expect(screen.queryByText(success.setupUrl)).not.toBeInTheDocument();
  });
  it("keeps selectable URL after clipboard rejection", async () => {
    const user = await submit();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
    await user.click(await screen.findByRole("button", { name: "Copy link" }));
    expect(await screen.findByText("Couldn't copy. Select the link and copy it manually.")).toBeVisible();
    expect(screen.getByText(success.setupUrl)).toBeVisible();
  });
  it("blocks duplicate requests and dismissal while pending", async () => {
    let finish!: (value: typeof success) => void;
    generate.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    const user = await submit();
    expect(screen.getByRole("button", { name: "Generating…" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Generating…" }));
    expect(generate).toHaveBeenCalledOnce();
    await act(async () => {
      finish(success);
    });
  });
  it("keeps unknown result locked across reopen until authoritative check, then requires explicit replacement", async () => {
    generate.mockRejectedValueOnce(new Error("lost"));
    check
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ state: "unfinished", userId: "target", setupExpiresAt: success.expiresAt });
    const user = await submit();
    await screen.findByRole("button", { name: "Check again" });
    expect(check).toHaveBeenCalledWith("target");
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Generate new link: pending" }));
    expect(screen.queryByRole("button", { name: "Generate new link" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Check again" }));
    expect(await screen.findByRole("button", { name: "Generate replacement link" })).toBeEnabled();
    expect(generate).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "Generate replacement link" }));
    await screen.findByRole("heading", { name: "New setup link ready" });
    expect(generate).toHaveBeenCalledTimes(2);
  });
  it.each(["completed", "missing"])("refreshes authoritative %s state and prevents issuance", async (state) => {
    generate.mockRejectedValueOnce(new Error("lost"));
    check.mockResolvedValue({ userId: "target", state });
    await submit();
    expect(
      await screen.findByText("Account changed. Users has been refreshed; no further link can be generated here.")
    ).toBeVisible();
    expect(refresh).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Generate replacement link" })).not.toBeInTheDocument();
    expect(notify).toHaveBeenCalledWith("Account changed. Users has been refreshed.");
  });
  it.each(["forbidden", "changed-state", "instance-unavailable", "retry", "origin-unavailable"])(
    "shows safe %s refusal",
    async (reason) => {
      generate.mockResolvedValue({
        ok: false,
        reason,
        message: reason === "origin-unavailable" ? "Configure NEXTAUTH_URL." : undefined,
      });
      await submit();
      expect(await screen.findByRole("alert")).not.toBeEmptyDOMElement();
      if (reason === "changed-state" || reason === "forbidden") {
        expect(refresh).toHaveBeenCalledOnce();
        expect(notify).toHaveBeenCalled();
      }
    }
  );
});
