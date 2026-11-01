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
    expect(within(cards[0]).getByRole("combobox", { name: "Role: bob" })).toBeVisible();
    expect(within(cards[1]).getByRole("button", { name: "Generate new link: alex" })).toBeVisible();
    expect(within(cards[1]).getByRole("button", { name: "Delete account: alex" })).toBeVisible();
    expect(within(cards[0]).getByRole("button", { name: "Delete account: bob" })).toBeVisible();
  });
  it("shows pending setup with its expiry, without promotion", () => {
    const future = new Date(Date.now() + 3_600_000).toISOString();
    show([{ ...member, setupComplete: false, setupExpiresAt: future }]);
    expect(screen.getByText(/Pending setup · Expires/)).toBeVisible();
    expect(document.querySelector("time")).toHaveAttribute("datetime", future);
    expect(screen.queryByRole("combobox", { name: /Role:/ })).not.toBeInTheDocument();
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
    expect(screen.getByText(/^Pending setup$/)).toBeVisible();
  });
  it("shows the username prominently with the name beneath, and no status for completed users", () => {
    show([
      { ...member, name: "Bob B" },
      { ...member, id: "plain", username: "cy" },
    ]);
    const [named, plain] = screen.getAllByRole("listitem");
    const username = within(named).getByText("bob");
    expect(username).toHaveClass("font-bold");
    expect(username.nextElementSibling).toHaveTextContent("Bob B");
    expect(within(plain).getAllByText(/./, { selector: "p" })).toHaveLength(1);
    expect(screen.queryByText(/Setup complete/)).not.toBeInTheDocument();
    expect(named).toHaveStyle({ background: "var(--bg)" });
  });
  it("puts the delete icon in the card's upper right at 44px", () => {
    show([member]);
    const trigger = screen.getByRole("button", { name: "Delete account: bob" });
    expect(trigger).toHaveClass("size-11");
    expect(trigger.parentElement).toHaveClass("absolute", "right-1", "top-1");
  });
  it("opens confirmation when another role is chosen and reverts on cancel", async () => {
    show([member]);
    const user = userEvent.setup();
    const select = screen.getByRole("combobox", { name: "Role: bob" });
    expect(select).toHaveTextContent("Member");
    await user.click(select);
    await user.click(await screen.findByRole("option", { name: "Admin" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Make admin for bob?");
    expect(select).toHaveTextContent("Member");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(select).toHaveTextContent("Member");
    await waitFor(() => expect(select).toHaveFocus());
    expect(changeUserRoleAction).not.toHaveBeenCalled();
  });
  it("labels the role select and places it before the Reset password action", () => {
    show([member]);
    const [card] = screen.getAllByRole("listitem");
    expect(within(card).getByText("Role")).toBeVisible();
    const select = within(card).getByRole("combobox", { name: "Role: bob" });
    const reset = within(card).getByRole("button", { name: /Reset password/ });
    expect(select.compareDocumentPosition(reset) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it("ignores re-choosing the current role", async () => {
    show([member]);
    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox", { name: "Role: bob" }));
    await user.click(await screen.findByRole("option", { name: "Member" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("opens the role list from the keyboard", async () => {
    show([member]);
    const user = userEvent.setup();
    screen.getByRole("combobox", { name: "Role: bob" }).focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("option", { name: "Admin" })).toBeVisible();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("option", { name: "Admin" })).not.toBeInTheDocument());
  });
  it("disables last admin removal and explains on keyboard focus", async () => {
    show([{ ...member, role: "admin", isLastCompletedAdmin: true }]);
    expect(screen.getByRole("combobox", { name: "Role: bob" })).toBeDisabled();
    await userEvent.tab();
    await userEvent.tab();
    await userEvent.tab();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Make another user an admin first.");
  });
  it("disables deleting the last admin and explains on keyboard focus", async () => {
    show([{ ...member, role: "admin", isLastCompletedAdmin: true }]);
    expect(screen.getByRole("button", { name: "Delete account: bob" })).toBeDisabled();
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
    await userEvent.click(screen.getByLabelText("Role unavailable: bob"));
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
    await user.click(screen.getByRole("combobox", { name: "Role: bob" }));
    await user.click(await screen.findByRole("option", { name: "Admin" }));
    await user.click(await screen.findByRole("button", { name: "Make admin" }));
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Role: bob", hidden: true })).toHaveTextContent("Member");
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
    await user.click(screen.getByRole("combobox", { name: "Role: bob" }));
    await user.click(await screen.findByRole("option", { name: role === "admin" ? "Member" : "Admin" }));
    expect(await screen.findByText(/private trips/)).toBeVisible();
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
