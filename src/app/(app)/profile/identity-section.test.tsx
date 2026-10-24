import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("./actions", () => ({
  updateProfile: vi.fn().mockResolvedValue({}),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/components/arrivo/form-section", () => ({
  Section: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Field: ({
    children,
    label,
    error,
    htmlFor,
  }: {
    children: React.ReactNode;
    label: string;
    htmlFor?: string;
    error?: string;
  }) => (
    <div>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {error && <p role="alert">{error}</p>}
    </div>
  ),
}));

import { ProfileIdentitySection } from "./identity-section";
import { updateProfile } from "./actions";
import { toast } from "sonner";
import type { UserProfile } from "@/data/types";

const baseUser: UserProfile = {
  id: "u1",
  name: "Alice",
  username: "alice",
  dateFormat: "MM/DD/YYYY",
  currency: "USD",
  distanceUnit: "imperial",
  passportNumber: null,
  passportExpiry: null,
  passportNationality: null,
  knownTravelerNumber: null,
  warningThreshold: 80,
  dangerThreshold: 90,
  loyaltyNumbers: [],
  wishlistDestinations: [],
  companions: [],
};

describe("ProfileIdentitySection — name validation (AC7)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows error and disables Save when name exceeds 100 chars", async () => {
    const user = userEvent.setup({ delay: null });
    render(<ProfileIdentitySection user={baseUser} />);
    const nameInput = screen.getByDisplayValue("Alice");
    await user.clear(nameInput);
    await user.type(nameInput, "A".repeat(101));
    expect(screen.getByRole("alert")).toHaveTextContent("Name must be 100 characters or fewer.");
    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
  });

  it("clears error when name is corrected to 100 chars or fewer", async () => {
    const user = userEvent.setup({ delay: null });
    render(<ProfileIdentitySection user={baseUser} />);
    const nameInput = screen.getByDisplayValue("Alice");
    await user.clear(nameInput);
    await user.type(nameInput, "A".repeat(101));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    await user.clear(nameInput);
    await user.type(nameInput, "Alice Smith");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save/i })).not.toBeDisabled();
  });

  it("no error shown when name is exactly 100 chars", async () => {
    const user = userEvent.setup({ delay: null });
    render(<ProfileIdentitySection user={baseUser} />);
    const nameInput = screen.getByDisplayValue("Alice");
    await user.clear(nameInput);
    await user.type(nameInput, "A".repeat(100));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("ProfileIdentitySection — username", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the current username in an editable field", () => {
    render(<ProfileIdentitySection user={baseUser} />);
    const usernameInput = screen.getByLabelText("Username");
    expect(usernameInput).toHaveValue("alice");
    expect(usernameInput).not.toHaveAttribute("readonly");
  });

  it("shows the validation error and disables Save for an invalid username", async () => {
    const user = userEvent.setup({ delay: null });
    render(<ProfileIdentitySection user={baseUser} />);
    const usernameInput = screen.getByLabelText("Username");
    await user.clear(usernameInput);
    await user.type(usernameInput, "al");
    expect(screen.getByRole("alert")).toHaveTextContent("Username must be 3–30 characters.");
    expect(usernameInput).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
  });

  it("treats a case-only change as unchanged", async () => {
    const user = userEvent.setup({ delay: null });
    const onDirtyChange = vi.fn();
    render(<ProfileIdentitySection user={baseUser} onDirtyChange={onDirtyChange} />);
    const usernameInput = screen.getByLabelText("Username");
    await user.clear(usernameInput);
    await user.type(usernameInput, "ALICE");
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
  });

  it("saves a new username alongside the name and reports dirty state", async () => {
    const user = userEvent.setup({ delay: null });
    const onDirtyChange = vi.fn();
    render(<ProfileIdentitySection user={baseUser} onDirtyChange={onDirtyChange} />);
    const usernameInput = screen.getByLabelText("Username");
    await user.clear(usernameInput);
    await user.type(usernameInput, "alice.w");
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);

    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(updateProfile).toHaveBeenCalledWith({ name: "Alice", username: "alice.w" });
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it("omits the username from the save when only the name changed", async () => {
    const user = userEvent.setup({ delay: null });
    const onDirtyChange = vi.fn();
    render(<ProfileIdentitySection user={baseUser} onDirtyChange={onDirtyChange} />);
    const nameInput = screen.getByDisplayValue("Alice");
    await user.type(nameInput, " Smith");
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);

    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(updateProfile).toHaveBeenCalledWith({ name: "Alice Smith" });
  });

  it("toasts the server error when the username is taken", async () => {
    vi.mocked(updateProfile).mockResolvedValueOnce({ error: "That username is taken." });
    const user = userEvent.setup({ delay: null });
    render(<ProfileIdentitySection user={baseUser} />);
    const usernameInput = screen.getByLabelText("Username");
    await user.clear(usernameInput);
    await user.type(usernameInput, "bob");
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(toast.error).toHaveBeenCalledWith("That username is taken.");
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
  });
});
