import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as navigation from "next/navigation";
import { TooltipProvider } from "@/components/ui/tooltip";
const { changeUserRoleAction, success } = vi.hoisted(() => ({ changeUserRoleAction: vi.fn(), success: vi.fn() }));
vi.mock("@/app/(app)/admin/users/actions", () => ({ changeUserRoleAction }));
vi.mock("sonner", () => ({ toast: { success } }));
import { InstanceUsersList } from "./instance-users-list";
import type { ChangeUserRoleResult, InstanceUserSummary } from "@/data/types";
const member: InstanceUserSummary = {
  id: "member",
  username: "bob",
  role: "member",
  setupComplete: true,
  isLastCompletedAdmin: false,
};
describe("InstanceUsersList", () => {
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
  function show(users: InstanceUserSummary[]) {
    render(
      <TooltipProvider>
        <InstanceUsersList users={users} currentUserId="self" />
      </TooltipProvider>
    );
  }
  it("shows pending setup with its expiry, without promotion", () => {
    const future = new Date(Date.now() + 3_600_000).toISOString();
    show([{ ...member, setupComplete: false, setupExpiresAt: future }]);
    expect(screen.getByText(/Pending setup · Expires/)).toBeVisible();
    expect(document.querySelector("time")).toHaveAttribute("datetime", future);
    expect(screen.queryByRole("button", { name: /Make admin/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate new link: bob" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Delete account: bob" })).toBeVisible();
  });
  it("offers no delete for completed accounts", () => {
    show([member]);
    expect(screen.queryByRole("button", { name: /Delete account/ })).not.toBeInTheDocument();
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
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Make another user an admin first.");
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
