import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const { issue, check } = vi.hoisted(() => ({ issue: vi.fn(), check: vi.fn() }));
vi.mock("@/app/(app)/admin/users/actions", () => ({
  issuePasswordResetAction: issue,
  checkSetupLinkTargetAction: check,
}));
import { ResetPasswordDialog } from "./reset-password-dialog";
beforeEach(() => issue.mockReset());
afterEach(cleanup);
it("keeps the server-rendered trigger disabled until hydration", () => {
  const markup = renderToString(<ResetPasswordDialog userId="target" username="alex" />);
  const container = document.createElement("div");
  container.innerHTML = markup;
  expect(container.querySelector('button[aria-label="Reset password: alex"]')).toBeDisabled();
  render(<ResetPasswordDialog userId="target" username="alex" />);
  expect(screen.getByRole("button", { name: "Reset password: alex" })).toBeEnabled();
});
it("opens by keyboard, generates once and focuses a selectable one-time link", async () => {
  issue.mockResolvedValue({
    ok: true,
    username: "alex",
    resetUrl: "https://arrivo.example/reset",
    expiresAt: "2026-10-29T13:00:00Z",
  });
  render(<ResetPasswordDialog userId="target" username="alex" />);
  const user = userEvent.setup();
  screen.getByRole("button", { name: "Reset password: alex" }).focus();
  await user.keyboard("{Enter}");
  expect(issue).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Generate link" }));
  const heading = await screen.findByRole("heading", { name: "Password reset link ready" });
  await waitFor(() => expect(heading).toHaveFocus());
  expect(screen.getByText("https://arrivo.example/reset")).toHaveClass("select-text");
  expect(issue).toHaveBeenCalledOnce();
});

it("restores focus on Escape without issuing", async () => {
  render(<ResetPasswordDialog userId="target" username="alex" />);
  const user = userEvent.setup();
  const trigger = screen.getByRole("button", { name: "Reset password: alex" });
  await user.click(trigger);
  await user.keyboard("{Escape}");
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(issue).not.toHaveBeenCalled();
});

it("shows issuance refusal and refreshes when account state changed", async () => {
  issue.mockResolvedValue({ ok: false, reason: "changed-state" });
  render(<ResetPasswordDialog userId="target" username="alex" />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Reset password: alex" }));
  await user.click(screen.getByRole("button", { name: "Generate link" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not generate");
  expect(screen.queryByRole("button", { name: "Generate link" })).not.toBeInTheDocument();
});

it("requires account reconciliation after an unknown result", async () => {
  issue.mockRejectedValueOnce(new Error("connection lost"));
  check.mockResolvedValueOnce({ state: "completed" });
  render(<ResetPasswordDialog userId="target" username="alex" />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Reset password: alex" }));
  await user.click(screen.getByRole("button", { name: "Generate link" }));
  await user.click(await screen.findByRole("button", { name: "Check account" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Previous result cannot be recovered");
  expect(screen.getByRole("button", { name: "Generate link" })).toBeVisible();
});
