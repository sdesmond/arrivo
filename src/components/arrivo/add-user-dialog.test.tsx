import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { Component, type ReactNode } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as navigation from "next/navigation";
import { AddUserFailure, type AddUserResult } from "@/data/types";
const { addUserAction, checkAddedUserAction } = vi.hoisted(() => ({
  addUserAction: vi.fn(),
  checkAddedUserAction: vi.fn(),
}));
vi.mock("@/app/(app)/admin/users/actions", () => ({ addUserAction, checkAddedUserAction }));
import { AddUserDialog } from "./add-user-dialog";

class FrameworkErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    return this.state.error ? <p>{this.state.error.message}</p> : this.props.children;
  }
}
const success = {
  ok: true,
  userId: "new",
  username: "alex.q",
  setupUrl: "https://arrivo.example/account-setup/open?token=sample",
  expiresAt: "2026-10-29T12:00:00.000Z",
} as const;
describe("AddUserDialog", () => {
  const refresh = vi.fn();
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(navigation, "useRouter").mockReturnValue({ ...navigation.useRouter(), refresh });
    addUserAction.mockResolvedValue(success);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });
  async function open() {
    render(
      <FrameworkErrorBoundary>
        <AddUserDialog />
      </FrameworkErrorBoundary>
    );
    const user = userEvent.setup();
    screen.getByRole("button", { name: "Add User" }).focus();
    await user.keyboard("{Enter}");
    return user;
  }
  async function submit(username = " Alex.Q ") {
    const user = await open();
    await user.type(screen.getByRole("textbox", { name: "Username" }), username);
    await user.click(screen.getByRole("button", { name: "Create account" }));
    return user;
  }
  it("validates locally and associates errors without a request", async () => {
    await submit("a!");
    expect(screen.getByLabelText("Username")).toHaveAccessibleDescription("Username must be 3–30 characters.");
    expect(addUserAction).not.toHaveBeenCalled();
  });
  it("normalizes creation, focuses result, copies, and clears result on close/reopen", async () => {
    const user = await submit();
    const heading = await screen.findByRole("heading", { name: "Account created. Share this setup link." });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(addUserAction).toHaveBeenCalledWith("alex.q");
    expect(refresh).toHaveBeenCalledOnce();
    expect(screen.getByText(success.setupUrl)).toHaveClass("select-text");
    expect(screen.getByText(new Date(success.expiresAt).toLocaleString(), { exact: false })).toBeVisible();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    await user.click(screen.getByRole("button", { name: "Copy link" }));
    expect(writeText).toHaveBeenCalledWith(success.setupUrl);
    expect(screen.getByRole("status")).toHaveTextContent("Link copied.");
    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Add User" })).toHaveFocus());
    await user.click(screen.getByRole("button", { name: "Add User" }));
    expect(screen.getByLabelText("Username")).toHaveValue("");
    expect(screen.queryByText(success.setupUrl)).not.toBeInTheDocument();
  });
  it.each(["missing", "rejected"])("retains selectable URL when clipboard is %s", async (mode) => {
    const user = await submit();
    if (mode === "missing") vi.stubGlobal("navigator", { ...navigator, clipboard: undefined });
    else vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("private"));
    await user.click(await screen.findByRole("button", { name: "Copy link" }));
    expect(await screen.findByText("Couldn't copy. Select the link and copy it manually.")).toBeVisible();
    expect(screen.getByText(success.setupUrl)).toBeVisible();
    vi.unstubAllGlobals();
  });
  it.each(Object.values(AddUserFailure))("keeps %s refusal editable with safe feedback", async (reason) => {
    addUserAction.mockResolvedValue({
      ok: false,
      reason,
      ...(reason === "origin-unavailable" ? { message: "Configure NEXTAUTH_URL." } : {}),
    });
    await submit();
    expect(screen.getByLabelText("Username")).toHaveAttribute("aria-invalid", "true");
    await waitFor(() => expect(screen.getByRole("button", { name: "Create account" })).toBeEnabled());
    expect(screen.getByRole("status")).not.toBeEmptyDOMElement();
    expect(refresh).toHaveBeenCalledTimes(reason === "forbidden" || reason === "app-unavailable" ? 1 : 0);
    if (reason === "origin-unavailable")
      expect(screen.getByRole("status")).toHaveTextContent("Configure NEXTAUTH_URL.");
  });
  it("blocks dismissal while creating and checking, then blocks repeated create when found", async () => {
    let rejectCreation!: (error: Error) => void;
    let finishCheck!: (exists: boolean) => void;
    addUserAction.mockReturnValue(
      new Promise<AddUserResult>((resolve, reject) => {
        rejectCreation = reject;
      })
    );
    checkAddedUserAction.mockReturnValue(
      new Promise<boolean>((resolve) => {
        finishCheck = resolve;
      })
    );
    const user = await submit();
    expect(screen.getByRole("button", { name: "Creating…" })).toBeDisabled();
    await user.keyboard("{Escape}");
    await user.click(document.querySelector('[data-slot="dialog-overlay"]')!);
    expect(screen.getByRole("dialog")).toBeVisible();
    await act(async () => {
      rejectCreation(new Error("private"));
    });
    expect(screen.getByRole("button", { name: "Checking…" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeVisible();
    await act(async () => {
      finishCheck(true);
    });
    expect(await screen.findByText("Account exists; link unavailable. Review Users before continuing.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Create account" })).not.toBeInTheDocument();
    expect(checkAddedUserAction).toHaveBeenCalledWith("alex.q");
    expect(addUserAction).toHaveBeenCalledOnce();
  });
  it("only allows explicit retry after authoritative absence", async () => {
    addUserAction.mockRejectedValueOnce(new Error("private"));
    checkAddedUserAction.mockResolvedValue(false);
    const user = await submit();
    expect(await screen.findByText("No account found. You can retry creation.")).toBeVisible();
    expect(addUserAction).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "Retry creation" }));
    expect(await screen.findByRole("heading", { name: "Account created. Share this setup link." })).toBeVisible();
    expect(addUserAction).toHaveBeenCalledTimes(2);
  });
  it("keeps creation locked after failed checking until Check again confirms absence", async () => {
    addUserAction.mockRejectedValue(new Error("private"));
    checkAddedUserAction.mockRejectedValueOnce(new Error("private")).mockResolvedValue(false);
    const user = await submit();
    expect(
      await screen.findByText("Result uncertain. Check again before trying to create this account.")
    ).toBeVisible();
    expect(screen.getByLabelText("Username")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Create account" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Check again" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Retry creation" })).toBeEnabled());
    expect(addUserAction).toHaveBeenCalledOnce();
  });
  it.each(["Cancel", "Escape"])(
    "preserves uncertain username and creation lock after %s and reopen",
    async (dismissal) => {
      addUserAction.mockRejectedValueOnce(new Error("private"));
      checkAddedUserAction.mockRejectedValueOnce(new Error("private")).mockResolvedValue(false);
      const user = await submit();
      await screen.findByText("Result uncertain. Check again before trying to create this account.");
      if (dismissal === "Cancel") await user.click(screen.getByRole("button", { name: "Cancel" }));
      else await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      await user.click(screen.getByRole("button", { name: "Add User" }));
      expect(screen.getByLabelText("Username")).toHaveValue("alex.q");
      expect(screen.getByLabelText("Username")).toBeDisabled();
      expect(screen.getByText("Result uncertain. Check again before trying to create this account.")).toBeVisible();
      expect(screen.queryByRole("button", { name: "Create account" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Copy link" })).not.toBeInTheDocument();
      expect(addUserAction).toHaveBeenCalledOnce();
      expect(checkAddedUserAction).toHaveBeenCalledOnce();
      await user.click(screen.getByRole("button", { name: "Check again" }));
      expect(await screen.findByRole("button", { name: "Retry creation" })).toBeEnabled();
      expect(checkAddedUserAction).toHaveBeenLastCalledWith("alex.q");
      expect(addUserAction).toHaveBeenCalledOnce();
    }
  );
  it.each(["creation", "checking"])("preserves framework signals during %s", async (phase) => {
    const signal = Object.assign(new Error("NEXT_REDIRECT;push;/profile;307;"), {
      digest: "NEXT_REDIRECT;push;/profile;307;",
    });
    vi.mocked(navigation.unstable_rethrow).mockImplementation((error) => {
      if (error === signal) throw error;
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    addUserAction.mockRejectedValue(phase === "creation" ? signal : new Error("network"));
    checkAddedUserAction.mockRejectedValue(signal);
    await submit();
    expect(await screen.findByText(signal.message)).toBeVisible();
    expect(navigation.unstable_rethrow).toHaveBeenCalledWith(signal);
  });
});
