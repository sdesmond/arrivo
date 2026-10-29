import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as navigation from "next/navigation";
import { TooltipProvider } from "@/components/ui/tooltip";
const { changeUserRoleAction, previewAccountDeletionAction, success } = vi.hoisted(() => ({
  changeUserRoleAction: vi.fn(),
  previewAccountDeletionAction: vi.fn(),
  success: vi.fn(),
}));
vi.mock("@/app/(app)/admin/users/actions", () => ({
  changeUserRoleAction,
  previewAccountDeletionAction,
  deleteAccountAction: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success } }));
import { AppUsersList } from "./app-users-list";
import type { ChangeUserRoleResult, AppUserSummary } from "@/data/types";
const member: AppUserSummary = {
  id: "member",
  username: "bob",
  role: "member",
  setupComplete: true,
  isLastCompletedAdmin: false,
};
describe("AppUsersList", () => {
  const push = vi.fn();
  const refresh = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(navigation, "useRouter").mockReturnValue({ ...navigation.useRouter(), push, refresh });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });
  function show(users: AppUserSummary[]) {
    render(
      <TooltipProvider>
        <AppUsersList users={users} currentUserId="self" />
      </TooltipProvider>
    );
  }
  it("groups each user's available controls in a responsive card grid", () => {
    show([member, { ...member, id: "pending", username: "alex", setupComplete: false }]);
    const list = screen.getByRole("list", { name: "App users" });
    expect(list).toHaveClass("grid");
    const cards = within(list).getAllByRole("listitem");
    expect(within(cards[0]).getByRole("button", { name: "Make admin: bob" })).toBeVisible();
    expect(within(cards[1]).getByRole("button", { name: "Generate new link: alex" })).toBeVisible();
    expect(within(cards[1]).getByRole("button", { name: "Delete account: alex" })).toBeVisible();
    expect(within(cards[0]).getByRole("button", { name: "Delete account: bob" })).toBeVisible();
  });
  it("shows pending setup with its expiry, without promotion", () => {
    const future = new Date(Date.now() + 3_600_000).toISOString();
    show([{ ...member, setupComplete: false, setupExpiresAt: future }]);
    expect(screen.getByText(/Pending setup · Expires/)).toBeVisible();
    expect(document.querySelector("time")).toHaveAttribute("datetime", future);
    expect(screen.queryByRole("button", { name: /Make admin/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate new link: bob" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Delete account: bob" })).toBeVisible();
  });
  it("offers deletion for completed, pending and the signed-in account alike", () => {
    show([
      member,
      { ...member, id: "self", username: "me" },
      { ...member, id: "pending", username: "alex", setupComplete: false },
    ]);
    for (const username of ["bob", "me", "alex"]) {
      expect(screen.getByRole("button", { name: `Delete account: ${username}` })).toBeVisible();
    }
  });
  it("tells the signed-in admin that deleting their own account signs them out", async () => {
    previewAccountDeletionAction.mockResolvedValue({
      ok: true,
      preview: {
        userId: "self",
        username: "me",
        setupComplete: true,
        transferredTripCount: 0,
        deletedTripCount: 0,
        fingerprint: "fingerprint",
      },
    });
    show([{ ...member, id: "self", username: "me" }]);
    await userEvent.setup().click(screen.getByRole("button", { name: "Delete account: me" }));
    expect(await screen.findByText("This is your account. You will be signed out.")).toBeVisible();
    expect(previewAccountDeletionAction).toHaveBeenCalledWith("self");
  });
  it("keeps the list focusable so focus has somewhere to land once a deleted row is gone", () => {
    show([member]);
    expect(screen.getByRole("list", { name: "App users" })).toHaveAttribute("tabindex", "-1");
  });
  it("offers reset only for other completed accounts", () => {
    show([
      member,
      { ...member, id: "self", username: "me" },
      { ...member, id: "pending", username: "pending", setupComplete: false },
    ]);
    expect(screen.getByRole("button", { name: "Reset password: bob" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Reset password: me" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reset password: pending" })).not.toBeInTheDocument();
  });
  it("shows setup expired once the link has lapsed", () => {
    const past = new Date(Date.now() - 3_600_000).toISOString();
    show([{ ...member, setupComplete: false, setupExpiresAt: past }]);
    expect(screen.getByText(/Setup expired/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Generate new link: bob" })).toBeVisible();
    expect(screen.queryByText(/Expires/)).not.toBeInTheDocument();
  });
  it("shows plain pending setup when no link is on record", () => {
    show([{ ...member, setupComplete: false }]);
    expect(screen.getByText(/Member · Pending setup$/)).toBeVisible();
  });
  it("disables last admin removal and explains on keyboard focus", async () => {
    show([{ ...member, role: "admin", isLastCompletedAdmin: true }]);
    expect(screen.getByRole("button", { name: "Remove admin: bob" })).toBeDisabled();
    await userEvent.tab();
    await userEvent.tab();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Make another user an admin first.");
  });
  it("disables deleting the last admin and explains on keyboard focus", async () => {
    show([{ ...member, role: "admin", isLastCompletedAdmin: true }]);
    expect(screen.getByRole("button", { name: "Delete account: bob" })).toBeDisabled();
    await userEvent.tab();
    await userEvent.tab();
    await userEvent.tab();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Make another user an admin first.");
  });
  it("explains disabled deletion on touch without opening the dialog", async () => {
    show([{ ...member, role: "admin", isLastCompletedAdmin: true }]);
    await userEvent.click(screen.getByLabelText("Delete account unavailable: bob"));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Make another user an admin first.");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(previewAccountDeletionAction).not.toHaveBeenCalled();
  });
  it("explains disabled removal on touch without opening confirmation", async () => {
    show([{ ...member, role: "admin", isLastCompletedAdmin: true }]);
    await userEvent.click(screen.getByLabelText("Remove admin unavailable: bob"));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Make another user an admin first.");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("waits for confirmed success and blocks duplicate submits", async () => {
    let finish!: (result: ChangeUserRoleResult) => void;
    changeUserRoleAction.mockReturnValue(
      new Promise<ChangeUserRoleResult>((resolve) => {
        finish = resolve;
      })
    );
    show([member]);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Make admin: bob" }));
    await user.click(screen.getByRole("button", { name: "Make admin" }));
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByText(/Member · Setup complete/)).toBeVisible();
    expect(success).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    await act(async () => {
      finish({ ok: true, userId: member.id, role: "admin", changed: true });
    });
    expect(changeUserRoleAction).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledOnce();
  });
  it.each(["member", "self", "other-admin"])("confirms role for %s then refreshes or navigates", async (id) => {
    const role = id === "member" ? "member" : "admin";
    const action = role === "admin" ? "Remove admin" : "Make admin";
    changeUserRoleAction.mockResolvedValue({
      ok: true,
      userId: id,
      role: role === "admin" ? "member" : "admin",
      changed: true,
    });
    show([{ ...member, id, role }]);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: `${action}: bob` }));
    expect(screen.getByText(/private trips/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: action }));
    await waitFor(() => expect(success).toHaveBeenCalled());
    expect(changeUserRoleAction).toHaveBeenCalledWith(id, role === "admin" ? "member" : "admin");
    if (id === "self") expect(push).toHaveBeenCalledWith("/profile");
    else {
      expect(refresh).toHaveBeenCalled();
      expect(push).not.toHaveBeenCalled();
    }
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
