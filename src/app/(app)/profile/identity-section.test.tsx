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

vi.mock("@/components/packt/form-section", () => ({
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
import type { UserProfile } from "@/data/types";

const baseUser: UserProfile = {
  id: "u1",
  name: "Alice",
  email: "alice@test.com",
  dateFormat: "MM/DD/YYYY",
  currency: "USD",
  distanceUnit: "imperial",
  passportNumber: null,
  passportExpiry: null,
  passportNationality: null,
  knownTravelerNumber: null,
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
