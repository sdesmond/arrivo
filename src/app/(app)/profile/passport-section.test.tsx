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

vi.mock("@/components/ui/date-picker", () => ({
  DatePicker: ({
    value,
    onChange,
    placeholder = "Pick a date",
  }: {
    value?: string;
    onChange: (v: string | undefined) => void;
    placeholder?: string;
  }) => (
    <input
      data-testid="date-picker"
      type="text"
      value={value ?? ""}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value || undefined)}
    />
  ),
}));

vi.mock("@/components/packt/form-section", () => ({
  Section: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Field: ({
    children,
    label,
    error,
  }: {
    children: React.ReactNode;
    label: string;
    htmlFor?: string;
    error?: string;
  }) => (
    <div>
      <label>{label}</label>
      {children}
      {error && <p role="alert">{error}</p>}
    </div>
  ),
}));

import { PassportSection } from "./passport-section";
import type { UserProfile } from "@/data/types";

const baseUser: UserProfile = {
  id: "u1",
  name: "Test",
  email: "t@t.com",
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

describe("PassportSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders empty fields when user has no passport data", () => {
    render(<PassportSection user={baseUser} />);
    expect(screen.getByPlaceholderText("e.g. A12345678")).toBeInTheDocument();
    expect(screen.getByTestId("date-picker")).toBeInTheDocument();
  });

  it("renders pre-filled passport number and expiry when set", () => {
    const user = { ...baseUser, passportNumber: "AB123456", passportExpiry: "2030-01-01" };
    render(<PassportSection user={user} />);
    expect(screen.getByDisplayValue("AB123456")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2030-01-01")).toBeInTheDocument();
  });

  it("Save button is disabled when no fields are dirty", () => {
    render(<PassportSection user={baseUser} />);
    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
  });

  it("Save button enables when a text field is changed", async () => {
    const user = userEvent.setup();
    render(<PassportSection user={baseUser} />);
    await user.type(screen.getByPlaceholderText("e.g. A12345678"), "X12345");
    expect(screen.getByRole("button", { name: /save/i })).not.toBeDisabled();
  });

  it("Save button enables when expiry date is changed via DatePicker", async () => {
    const user = userEvent.setup();
    render(<PassportSection user={baseUser} />);
    await user.type(screen.getByTestId("date-picker"), "2030-06-01");
    expect(screen.getByRole("button", { name: /save/i })).not.toBeDisabled();
  });

  it("calls updateProfile with updated passport number on save", async () => {
    const { updateProfile } = await import("./actions");
    const user = userEvent.setup();
    render(<PassportSection user={baseUser} />);
    await user.type(screen.getByPlaceholderText("e.g. A12345678"), "CD999");
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(updateProfile).toHaveBeenCalledWith(expect.objectContaining({ passportNumber: "CD999" }));
  });

  it("shows error and disables Save when passport number exceeds 20 chars (AC8)", async () => {
    const user = userEvent.setup();
    render(<PassportSection user={baseUser} />);
    await user.type(screen.getByPlaceholderText("e.g. A12345678"), "A".repeat(21));
    expect(screen.getByRole("alert")).toHaveTextContent("Passport number must be 20 characters or fewer.");
    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
  });

  it("clears passport error when corrected to 20 chars or fewer (AC8)", async () => {
    const user = userEvent.setup();
    render(<PassportSection user={baseUser} />);
    const input = screen.getByPlaceholderText("e.g. A12345678");
    await user.type(input, "A".repeat(21));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    await user.clear(input);
    await user.type(input, "A12345678");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save/i })).not.toBeDisabled();
  });
});
