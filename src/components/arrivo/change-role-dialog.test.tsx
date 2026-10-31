import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { Component, type ReactNode } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as navigation from "next/navigation";
import { Button } from "@/components/ui/button";
import { RoleChangeFailure } from "@/data/types";
import type { ChangeUserRoleResult } from "@/data/types";
const { changeUserRoleAction } = vi.hoisted(() => ({ changeUserRoleAction: vi.fn() }));
vi.mock("@/app/(app)/admin/users/actions", () => ({ changeUserRoleAction }));
import { ChangeRoleDialog } from "./change-role-dialog";
const account = {
  id: "target",
  username: "amy",
  role: "admin" as const,
  setupComplete: true,
  isLastCompletedAdmin: false,
};
class FrameworkErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    return this.state.error ? <p role="status">{this.state.error.message}</p> : this.props.children;
  }
}
describe("ChangeRoleDialog", () => {
  const refresh = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(navigation, "useRouter").mockReturnValue({ ...navigation.useRouter(), refresh });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });
  function show() {
    render(
      <FrameworkErrorBoundary>
        <ChangeRoleDialog user={account} onSuccess={vi.fn()}>
          <Button>Remove admin: amy</Button>
        </ChangeRoleDialog>
      </FrameworkErrorBoundary>
    );
  }
  it("keeps pending confirmation open through Escape and backdrop until failure is visible", async () => {
    let finish!: (result: ChangeUserRoleResult) => void;
    changeUserRoleAction.mockReturnValue(
      new Promise<ChangeUserRoleResult>((resolve) => {
        finish = resolve;
      })
    );
    show();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Remove admin: amy" }));
    await user.click(screen.getByRole("button", { name: "Remove admin" }));
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeVisible();
    await user.click(document.querySelector('[data-slot="dialog-overlay"]')!);
    expect(screen.getByRole("dialog")).toBeVisible();
    await act(async () => {
      finish({ ok: false, reason: RoleChangeFailure.Retry });
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save. Try again.");
  });
  it("shows safe inline failure when the request rejects", async () => {
    const error = new Error("private network details");
    changeUserRoleAction.mockRejectedValue(error);
    show();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Remove admin: amy" }));
    await user.click(screen.getByRole("button", { name: "Remove admin" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save. Try again.");
    expect(navigation.unstable_rethrow).toHaveBeenCalledWith(error);
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.queryByText(error.message)).not.toBeInTheDocument();
  });
  it.each(["NEXT_HTTP_ERROR_FALLBACK;404", "NEXT_REDIRECT;push;/profile;307;"])(
    "propagates framework signal %s",
    async (digest) => {
      const error = Object.assign(new Error(digest), { digest });
      vi.mocked(navigation.unstable_rethrow).mockImplementationOnce((caught) => {
        throw caught;
      });
      vi.spyOn(console, "error").mockImplementation(() => {});
      changeUserRoleAction.mockRejectedValue(error);
      show();
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: "Remove admin: amy" }));
      await user.click(screen.getByRole("button", { name: "Remove admin" }));
      expect(await screen.findByRole("status")).toHaveTextContent(digest);
      expect(navigation.unstable_rethrow).toHaveBeenCalledWith(error);
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    }
  );
  it("focuses Cancel on demotion and restores trigger focus on Escape and Cancel", async () => {
    show();
    const user = userEvent.setup();
    const trigger = screen.getByRole("button", { name: "Remove admin: amy" });
    trigger.focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus());
    await user.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(changeUserRoleAction).not.toHaveBeenCalled();
  });
  it("opens without a trigger when controlled, reports close on Cancel, and returns focus to the given target", async () => {
    const onOpenChange = vi.fn();
    const onSuccess = vi.fn();
    changeUserRoleAction.mockResolvedValue({ ok: true, userId: "target", role: "member", changed: true });
    const target = document.createElement("button");
    document.body.appendChild(target);
    const view = render(
      <ChangeRoleDialog
        user={account}
        onSuccess={onSuccess}
        open={false}
        onOpenChange={onOpenChange}
        getFocusTargetOnClose={() => target}
      />
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    view.rerender(
      <ChangeRoleDialog
        user={account}
        onSuccess={onSuccess}
        open
        onOpenChange={onOpenChange}
        getFocusTargetOnClose={() => target}
      />
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(changeUserRoleAction).not.toHaveBeenCalled();
    view.rerender(
      <ChangeRoleDialog
        user={account}
        onSuccess={onSuccess}
        open={false}
        onOpenChange={onOpenChange}
        getFocusTargetOnClose={() => target}
      />
    );
    await waitFor(() => expect(target).toHaveFocus());
    view.rerender(<ChangeRoleDialog user={account} onSuccess={onSuccess} open onOpenChange={onOpenChange} />);
    await user.click(await screen.findByRole("button", { name: "Remove admin" }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith("member"));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    target.remove();
  });
  it.each(Object.values(RoleChangeFailure))("keeps dialog open for %s with safe copy", async (reason) => {
    changeUserRoleAction.mockResolvedValue({ ok: false, reason });
    show();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Remove admin: amy" }));
    await user.click(screen.getByRole("button", { name: "Remove admin" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      reason === "last-admin" ? "Make another user an admin first." : "Couldn't save. Try again."
    );
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(refresh).toHaveBeenCalledTimes(reason === "not-found" || reason === "forbidden" ? 1 : 0);
  });
});
