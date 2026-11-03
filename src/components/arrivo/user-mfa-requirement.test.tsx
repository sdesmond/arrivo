import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const save = vi.hoisted(() => vi.fn());
vi.mock("@/app/(app)/admin/users/actions", () => ({ saveUserMfaRequirement: save }));
import { UserMfaRequirement } from "./user-mfa-requirement";
describe("UserMfaRequirement", () => {
  beforeEach(() => save.mockReset());
  it("saves expected value and shows no save status", async () => {
    save.mockResolvedValue({ status: "ok", required: true });
    render(<UserMfaRequirement userId="user" instanceRequired={false} required={false} />);
    await userEvent.click(screen.getByRole("switch"));
    expect(save).toHaveBeenCalledWith("user", true, false);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
  it("preserves value and explains refused saves", async () => {
    save.mockResolvedValue({ status: "stale" });
    render(<UserMfaRequirement userId="user" instanceRequired={false} required={false} />);
    await userEvent.click(screen.getByRole("switch"));
    expect(screen.getByRole("switch")).not.toBeChecked();
    expect(screen.getByRole("alert")).toBeVisible();
  });
});

it.each([
  { required: undefined, instanceRequired: false },
  { required: false, instanceRequired: undefined },
])("disables unknown individual or inherited policy", async (policy) => {
  save.mockReset();
  render(<UserMfaRequirement userId="user" {...policy} />);
  expect(screen.getByRole("switch")).toHaveAttribute("aria-disabled", "true");
  expect(screen.getByRole("alert")).toHaveTextContent("unavailable");
  await userEvent.click(screen.getByRole("switch"));
  expect(save).not.toHaveBeenCalled();
});

it.each([false, true])(
  "shows inherited on/disabled and follows authoritative global reset from %s",
  async (required) => {
    save.mockReset();
    const { rerender } = render(<UserMfaRequirement userId="user" instanceRequired={true} required={required} />);
    const control = screen.getByRole("switch", { name: "Require 2FA" });
    expect(control).toBeChecked();
    expect(control).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(control);
    expect(save).not.toHaveBeenCalled();
    const trigger = screen.getByLabelText("2FA requirement managed by Security");
    trigger.focus();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("2FA is turned on for everyone in the Security tab");
    await userEvent.keyboard("{Escape}");
    rerender(<UserMfaRequirement userId="user" instanceRequired={false} required={false} />);
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("switch")).not.toHaveAttribute("aria-disabled", "true");
  }
);
