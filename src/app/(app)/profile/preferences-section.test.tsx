// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProfilePreferencesSection } from "./preferences-section";
import type { UserProfile } from "@/data/types";
import * as actions from "./actions";

vi.mock("./actions", () => ({ updateProfile: vi.fn().mockResolvedValue(undefined) }));

const mockUser: UserProfile = {
  id: "u1",
  name: "Test",
  email: "test@test.com",
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

describe("ProfilePreferencesSection", () => {
  beforeEach(() => {
    vi.mocked(actions.updateProfile).mockClear();
  });

  it("renders with initial values", () => {
    render(<ProfilePreferencesSection user={mockUser} />);
    expect(screen.getByText("Date format")).toBeInTheDocument();
    expect(screen.getByLabelText("Currency")).toBeInTheDocument();
    expect(screen.getByText("Distance units")).toBeInTheDocument();
  });

  it("date format toggle changes selection", async () => {
    render(<ProfilePreferencesSection user={mockUser} />);
    const dayMonthBtn = screen.getByRole("button", { name: "Day/Month" });
    expect(dayMonthBtn).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(dayMonthBtn);
    expect(dayMonthBtn).toHaveAttribute("aria-pressed", "true");
  });

  it("distance unit toggle changes selection", async () => {
    render(<ProfilePreferencesSection user={mockUser} />);
    const metricBtn = screen.getByRole("button", { name: "metric" });
    expect(metricBtn).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(metricBtn);
    expect(metricBtn).toHaveAttribute("aria-pressed", "true");
  });

  it("currency input changes and uppercases value", async () => {
    render(<ProfilePreferencesSection user={mockUser} />);
    const input = screen.getByLabelText("Currency") as HTMLInputElement;
    await userEvent.clear(input);
    await userEvent.type(input, "eur");
    expect(input.value).toBe("EUR");
  });

  it("Save button disabled when not dirty", () => {
    render(<ProfilePreferencesSection user={mockUser} />);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("Save button enabled after changing date format", async () => {
    render(<ProfilePreferencesSection user={mockUser} />);
    await userEvent.click(screen.getByRole("button", { name: "Day/Month" }));
    expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
  });

  it("only sends changed fields in the patch — unchanged fields are omitted", async () => {
    render(<ProfilePreferencesSection user={mockUser} />);
    // mockUser has dateFormat="MM/DD/YYYY", currency="USD", distanceUnit="imperial"
    // Change only the date format
    await userEvent.click(screen.getByRole("button", { name: "Day/Month" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(vi.mocked(actions.updateProfile)).toHaveBeenCalledWith({ dateFormat: "DD/MM/YYYY" });
  });

  it("sends only currency when only currency changes", async () => {
    render(<ProfilePreferencesSection user={mockUser} />);
    const input = screen.getByLabelText("Currency") as HTMLInputElement;
    await userEvent.clear(input);
    await userEvent.type(input, "EUR");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(vi.mocked(actions.updateProfile)).toHaveBeenCalledWith({ currency: "EUR" });
  });
});
