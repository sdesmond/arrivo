import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const save = vi.hoisted(() => vi.fn());
vi.mock("@/app/(app)/admin/security/actions", () => ({ saveMfaPolicySettings: save }));
import { MfaPolicySettings, MfaRequirementControl } from "./mfa-policy-settings";
describe("MfaPolicySettings", () => {
  beforeEach(() => save.mockReset());
  it("saves expected value and shows no save status", async () => {
    save.mockResolvedValue({ status: "ok", required: true });
    render(<MfaPolicySettings required={false} />);
    await userEvent.click(screen.getByRole("switch"));
    expect(save).toHaveBeenCalledWith(true, false);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
  it("preserves value and explains refused saves", async () => {
    save.mockResolvedValue({ status: "stale" });
    render(<MfaPolicySettings required={false} />);
    await userEvent.click(screen.getByRole("switch"));
    expect(screen.getByRole("switch")).not.toBeChecked();
    expect(screen.getByRole("alert")).toBeVisible();
  });
});

it("disables unavailable policy instead of presenting an editable default", () => {
  render(<MfaPolicySettings />);
  expect(screen.getByRole("switch")).toHaveAttribute("aria-disabled", "true");
  expect(screen.getByRole("alert")).toHaveTextContent("unavailable");
});
it("reports rejected transport failures without changing saved value", async () => {
  save.mockRejectedValue(new Error("transport"));
  render(<MfaPolicySettings required={true} />);
  await userEvent.click(screen.getByRole("switch"));
  expect(screen.getByRole("switch")).toBeChecked();
  expect(screen.getByRole("alert")).toHaveTextContent("unavailable");
});

it("explains the effect of each saved switch state", async () => {
  save.mockResolvedValue({ status: "ok", required: true });
  render(<MfaPolicySettings required={false} />);
  expect(screen.getByText("Turning this on will enforce 2FA enrollment at next sign-in")).toBeVisible();
  await userEvent.click(screen.getByRole("switch"));
  expect(screen.getByText("Turning this off will not remove 2FA from users currently enrolled")).toBeVisible();
});

it("resets mounted switch to refreshed authoritative value", () => {
  const { rerender } = render(<MfaPolicySettings required={false} />);
  rerender(<MfaPolicySettings required={true} />);
  expect(screen.getByRole("switch")).toBeChecked();
  expect(screen.getByText("Turning this off will not remove 2FA from users currently enrolled")).toBeVisible();
  rerender(<MfaPolicySettings required={false} />);
  expect(screen.getByRole("switch")).not.toBeChecked();
});
it.each(["resolve", "reject"])("disables duplicate gestures while deferred save will %s", async (outcome) => {
  save.mockReset();
  let resolveSave!: (value: { status: "ok"; required: boolean }) => void;
  let rejectSave!: (error: Error) => void;
  save.mockReturnValue(
    new Promise((resolve, reject) => {
      resolveSave = resolve;
      rejectSave = reject;
    })
  );
  render(<MfaPolicySettings required={false} />);
  const control = screen.getByRole("switch");
  await userEvent.click(control);
  expect(control).toHaveAttribute("aria-disabled", "true");
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  await userEvent.click(control);
  await userEvent.keyboard(" ");
  expect(save).toHaveBeenCalledTimes(1);
  await act(async () => {
    if (outcome === "resolve") resolveSave({ status: "ok", required: true });
    else rejectSave(new Error("transport"));
  });
  expect(control).not.toHaveAttribute("aria-disabled", "true");
  expect(control).toHaveAttribute("aria-checked", outcome === "resolve" ? "true" : "false");
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  if (outcome === "reject") expect(screen.getByRole("alert")).toBeVisible();
});

it("shows inherited policy as on and disabled without changing its individual value", () => {
  render(<MfaRequirementControl label="Require 2FA" required={false} inherited onSave={save} />);
  expect(screen.getByRole("switch")).toBeChecked();
  expect(screen.getByRole("switch")).toHaveAttribute("aria-disabled", "true");
});
