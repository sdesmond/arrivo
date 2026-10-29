import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as navigation from "next/navigation";
const { remove, success, info } = vi.hoisted(() => ({ remove: vi.fn(), success: vi.fn(), info: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success, info } }));
vi.mock("@/app/(app)/admin/users/actions", () => ({ deleteUnfinishedAccountAction: remove }));
import { DeleteUnfinishedAccountDialog } from "./delete-unfinished-account-dialog";

describe("DeleteUnfinishedAccountDialog", () => {
  const refresh = vi.fn();
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(navigation, "useRouter").mockReturnValue({ ...navigation.useRouter(), refresh });
    remove.mockResolvedValue({ ok: true, userId: "target", username: "pending" });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });
  async function open() {
    render(<DeleteUnfinishedAccountDialog userId="target" username="pending" />);
    const user = userEvent.setup();
    screen.getByRole("button", { name: "Delete account: pending" }).focus();
    await user.keyboard("{Enter}");
    return user;
  }
  it("opens by keyboard without deleting, focuses the title, and Escape returns focus", async () => {
    const user = await open();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Delete unfinished account" })).toHaveFocus());
    expect(remove).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.getByRole("button", { name: "Delete account: pending" })).toHaveFocus());
  });
  it("cancels without deleting and restores trigger focus", async () => {
    const user = await open();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Delete account: pending" })).toHaveFocus());
    expect(remove).not.toHaveBeenCalled();
  });
  it("deletes on confirm, refreshes Users and closes", async () => {
    const user = await open();
    await user.click(screen.getByRole("button", { name: "Delete account" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(remove).toHaveBeenCalledWith("target");
    expect(refresh).toHaveBeenCalledOnce();
    expect(success).toHaveBeenCalledWith("Unfinished account deleted.");
  });
  it("blocks duplicate requests and dismissal while pending", async () => {
    let finish!: (value: unknown) => void;
    remove.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    const user = await open();
    await user.click(screen.getByRole("button", { name: "Delete account" }));
    expect(screen.getByRole("button", { name: "Deleting…" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(remove).toHaveBeenCalledOnce();
    await act(async () => {
      finish({ ok: true, userId: "target", username: "pending" });
    });
  });
  it.each(["changed-state", "forbidden"])("refreshes Users on %s without claiming success", async (reason) => {
    remove.mockResolvedValue({ ok: false, reason });
    const user = await open();
    await user.click(screen.getByRole("button", { name: "Delete account" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(info).toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
  });
  it.each(["retry", "app-unavailable"])("keeps the dialog open with an error on %s", async (reason) => {
    remove.mockResolvedValue({ ok: false, reason });
    const user = await open();
    await user.click(screen.getByRole("button", { name: "Delete account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't delete the account. Try again.");
    expect(refresh).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Delete account: pending" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("refreshes Users and asks for review when the response is lost", async () => {
    remove.mockRejectedValue(new Error("lost"));
    const user = await open();
    await user.click(screen.getByRole("button", { name: "Delete account" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(info).toHaveBeenCalledWith("Couldn't confirm the deletion. Review Users.");
    expect(success).not.toHaveBeenCalled();
  });
});
