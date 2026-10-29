import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as navigation from "next/navigation";
const { preview, remove, success, info } = vi.hoisted(() => ({
  preview: vi.fn(),
  remove: vi.fn(),
  success: vi.fn(),
  info: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success, info } }));
vi.mock("@/app/(app)/admin/users/actions", () => ({
  previewAccountDeletionAction: preview,
  deleteAccountAction: remove,
}));
import { DeleteAccountDialog } from "./delete-account-dialog";
import type { AdminDeletionPreview } from "@/data/types";

const PREVIEW: AdminDeletionPreview = {
  userId: "target",
  username: "pat",
  setupComplete: true,
  transferredTripCount: 2,
  deletedTripCount: 1,
  fingerprint: "first-fingerprint",
};

describe("DeleteAccountDialog", () => {
  const refresh = vi.fn();
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(navigation, "useRouter").mockReturnValue({ ...navigation.useRouter(), refresh });
    preview.mockResolvedValue({ ok: true, preview: PREVIEW });
    remove.mockResolvedValue({ ok: true, userId: "target", username: "pat" });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  async function open(props: Partial<React.ComponentProps<typeof DeleteAccountDialog>> = {}) {
    render(<DeleteAccountDialog userId="target" username="pat" setupComplete isCurrentUser={false} {...props} />);
    const user = userEvent.setup();
    screen.getByRole("button", { name: "Delete account: pat" }).focus();
    await user.keyboard("{Enter}");
    return user;
  }
  const submit = () => screen.getByRole("button", { name: /^Delete account$/ });

  it("names the target, announces the check, and focuses Cancel first", async () => {
    let finish!: (value: unknown) => void;
    preview.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    await open();

    expect(await screen.findByRole("status")).toHaveTextContent("Checking what deleting pat changes");
    expect(screen.getByRole("dialog", { name: "Delete account" })).toBeVisible();
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus());
    expect(submit()).toBeDisabled();
    expect(remove).not.toHaveBeenCalled();
    await act(async () => finish({ ok: true, preview: PREVIEW }));
  });

  it("shows aggregate outcomes only and enables deletion once reviewed", async () => {
    await open();

    expect(await screen.findByText(/2 trips will pass to the earliest manager or editor/)).toBeVisible();
    expect(screen.getByText(/1 trip with no manager or editor left will be deleted/)).toBeVisible();
    expect(submit()).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent("2 trips will pass");
    expect(screen.getByRole("dialog")).not.toHaveTextContent("first-fingerprint");
    expect(preview).toHaveBeenCalledWith("target");
  });

  it("says so when the account owns no trips", async () => {
    preview.mockResolvedValue({ ok: true, preview: { ...PREVIEW, transferredTripCount: 0, deletedTripCount: 0 } });
    await open();

    expect(await screen.findByText("It owns no trips.")).toBeVisible();
  });

  it("describes a pending account without trip detail it cannot have", async () => {
    preview.mockResolvedValue({ ok: true, preview: { ...PREVIEW, setupComplete: false } });
    await open({ setupComplete: false });

    expect(screen.getByRole("dialog", { name: "Delete unfinished account" })).toBeVisible();
    expect(screen.getByText(/setup link stops working/)).toBeVisible();
  });

  it.each([
    ["a pending row whose account has since completed setup", false, true],
    ["a completed row whose account is somehow unfinished", true, false],
  ])("refreshes instead of reviewing %s", async (_label, rowSetupComplete, previewSetupComplete) => {
    preview.mockResolvedValue({ ok: true, preview: { ...PREVIEW, setupComplete: previewSetupComplete } });
    await open({ setupComplete: rowSetupComplete });

    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(info).toHaveBeenCalledWith(expect.stringContaining("Account changed"));
    expect(remove).not.toHaveBeenCalled();
  });

  it("refreshes instead of renewing the review when the account changed state after review", async () => {
    remove.mockResolvedValueOnce({ ok: false, reason: "changed", preview: { ...PREVIEW, setupComplete: false } });
    const user = await open();
    await screen.findByText(/2 trips/);

    await user.click(submit());

    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(remove).toHaveBeenCalledOnce();
  });

  it("warns the signed-in admin that deleting themselves signs them out", async () => {
    await open({ isCurrentUser: true });

    expect(await screen.findByText("This is your account. You will be signed out.")).toBeVisible();
  });

  it("Escape dismisses an idle dialog and returns focus to the trigger", async () => {
    const user = await open();
    await screen.findByText(/2 trips/);

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.getByRole("button", { name: "Delete account: pat" })).toHaveFocus());
    expect(remove).not.toHaveBeenCalled();
  });

  it("cancels without deleting", async () => {
    const user = await open();
    await screen.findByText(/2 trips/);

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(remove).not.toHaveBeenCalled();
  });

  it("deletes with the reviewed fingerprint, refreshes Users and closes", async () => {
    const user = await open();
    await screen.findByText(/2 trips/);

    await user.click(submit());

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(remove).toHaveBeenCalledWith("target", "first-fingerprint");
    expect(refresh).toHaveBeenCalledOnce();
    expect(success).toHaveBeenCalledWith("Account deleted.");
  });

  it("uses the unfinished wording for a pending account", async () => {
    preview.mockResolvedValue({ ok: true, preview: { ...PREVIEW, setupComplete: false } });
    const user = await open({ setupComplete: false });
    await screen.findByText(/2 trips/);

    await user.click(submit());

    await waitFor(() => expect(success).toHaveBeenCalledWith("Unfinished account deleted."));
  });

  it("moves focus to the supplied target when the deleted row's trigger is gone", async () => {
    const target = document.createElement("ul");
    target.tabIndex = -1;
    document.body.append(target);
    const user = await open({ getFocusTargetAfterDelete: () => target });
    await screen.findByText(/2 trips/);

    await user.click(submit());

    await waitFor(() => expect(target).toHaveFocus());
    target.remove();
  });

  it("shows the new outcome and needs a second confirmation when outcomes changed", async () => {
    remove.mockResolvedValueOnce({
      ok: false,
      reason: "changed",
      preview: { ...PREVIEW, transferredTripCount: 1, deletedTripCount: 2, fingerprint: "second-fingerprint" },
    });
    const user = await open();
    await screen.findByText(/2 trips/);

    await user.click(submit());

    expect(await screen.findByRole("alert")).toHaveTextContent("Trips changed since you reviewed them");
    expect(screen.getByText(/1 trip will pass/)).toBeVisible();
    expect(screen.getByText(/2 trips with no manager or editor left will be deleted/)).toBeVisible();
    expect(remove).toHaveBeenCalledOnce();
    expect(refresh).not.toHaveBeenCalled();

    await user.click(submit());

    await waitFor(() => expect(remove).toHaveBeenLastCalledWith("target", "second-fingerprint"));
    await waitFor(() => expect(success).toHaveBeenCalled());
  });

  it("blocks duplicate requests and dismissal while deleting", async () => {
    let finish!: (value: unknown) => void;
    remove.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const user = await open();
    await screen.findByText(/2 trips/);

    await user.click(submit());
    expect(screen.getByRole("button", { name: "Deleting…" })).toBeDisabled();
    await user.keyboard("{Escape}");

    expect(screen.getByRole("dialog")).toBeVisible();
    expect(remove).toHaveBeenCalledOnce();
    await act(async () => finish({ ok: true, userId: "target", username: "pat" }));
  });

  it.each([
    ["forbidden", "Admin access changed"],
    ["last-admin", "only finished admin"],
    ["changed", "Account changed"],
  ])("refreshes Users without claiming success when deleting returns %s", async (reason, text) => {
    remove.mockResolvedValue({ ok: false, reason });
    const user = await open();
    await screen.findByText(/2 trips/);

    await user.click(submit());

    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(info).toHaveBeenCalledWith(expect.stringContaining(text));
    expect(success).not.toHaveBeenCalled();
  });

  it.each(["retry", "app-unavailable"])(
    "keeps the dialog open with an error when deleting returns %s",
    async (reason) => {
      remove.mockResolvedValue({ ok: false, reason });
      const user = await open();
      await screen.findByText(/2 trips/);

      await user.click(submit());

      expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't delete the account. Try again.");
      expect(refresh).not.toHaveBeenCalled();
      expect(submit()).toBeEnabled();
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      await user.click(screen.getByRole("button", { name: "Delete account: pat" }));
      expect(screen.queryByText("Couldn't delete the account. Try again.")).not.toBeInTheDocument();
    }
  );

  it("refreshes Users and asks for review when the delete response is lost", async () => {
    remove.mockRejectedValue(new Error("lost"));
    const user = await open();
    await screen.findByText(/2 trips/);

    await user.click(submit());

    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(info).toHaveBeenCalledWith("Couldn't confirm the deletion. Review Users.");
    expect(success).not.toHaveBeenCalled();
  });

  it.each(["forbidden", "last-admin", "changed"])("closes and refreshes when the review returns %s", async (reason) => {
    preview.mockResolvedValue({ ok: false, reason });
    await open();

    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(remove).not.toHaveBeenCalled();
  });

  it.each([
    ["a retryable refusal", () => preview.mockResolvedValue({ ok: false, reason: "retry" })],
    ["a thrown error", () => preview.mockRejectedValue(new Error("down"))],
  ])("offers Try again, never deletion, when the review fails with %s", async (_label, arrange) => {
    arrange();
    const user = await open();

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't check what deleting this account changes.");
    expect(submit()).toBeDisabled();
    preview.mockResolvedValue({ ok: true, preview: PREVIEW });
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText(/2 trips/)).toBeVisible();
    expect(submit()).toBeEnabled();
  });

  it("ignores a review that arrives after the dialog was closed", async () => {
    let finish!: (value: unknown) => void;
    preview.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const user = await open();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await act(async () => finish({ ok: false, reason: "forbidden" }));

    expect(refresh).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
  });
});
