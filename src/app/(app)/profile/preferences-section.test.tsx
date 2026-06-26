import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProfilePreferencesSection } from "./preferences-section";
import type { UserProfile } from "@/data/types";
import * as actions from "./actions";

vi.mock("./actions", () => ({ updateProfile: vi.fn().mockResolvedValue({}) }));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const mockUser: UserProfile = {
  id: "u1",
  name: "Test",
  email: "test@test.com",
  dateFormat: "MM/DD/YYYY",
  currency: "USD",
  distanceUnit: "imperial",
  defaultCoverType: "photo",
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

  it("renders cover type toggle with three options", () => {
    render(<ProfilePreferencesSection user={mockUser} />);
    expect(screen.getByText("Default trip cover type")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Photo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Map" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Graphic" })).toBeInTheDocument();
  });

  it("Photo is selected by default when no preference saved", () => {
    const userWithoutPref: UserProfile = { ...mockUser, defaultCoverType: undefined };
    render(<ProfilePreferencesSection user={userWithoutPref} />);
    expect(screen.getByRole("button", { name: "Photo" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Map" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Graphic" })).toHaveAttribute("aria-pressed", "false");
  });

  it("changing cover type enables Save and toggle reflects new value", async () => {
    render(<ProfilePreferencesSection user={mockUser} />);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Map" }));
    expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Photo" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Map" })).toHaveAttribute("aria-pressed", "true");
  });

  it("saves cover type patch when changed", async () => {
    render(<ProfilePreferencesSection user={mockUser} />);
    await userEvent.click(screen.getByRole("button", { name: "Map" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(vi.mocked(actions.updateProfile)).toHaveBeenCalledWith({ defaultCoverType: "map" });
  });

  it("saves graphic cover type patch", async () => {
    render(<ProfilePreferencesSection user={mockUser} />);
    await userEvent.click(screen.getByRole("button", { name: "Graphic" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(vi.mocked(actions.updateProfile)).toHaveBeenCalledWith({ defaultCoverType: "graphic" });
  });

  it("renders with saved Graphic preference selected", () => {
    const userWithGraphic: UserProfile = { ...mockUser, defaultCoverType: "graphic" };
    render(<ProfilePreferencesSection user={userWithGraphic} />);
    expect(screen.getByRole("button", { name: "Graphic" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Photo" })).toHaveAttribute("aria-pressed", "false");
  });

  it("renders Budget section with heading", () => {
    render(<ProfilePreferencesSection user={mockUser} />);
    expect(screen.getByText("Budget")).toBeInTheDocument();
  });

  it("renders threshold selects with defaults", () => {
    render(<ProfilePreferencesSection user={mockUser} />);
    expect(screen.getByRole("combobox", { name: "Warning %" })).toHaveTextContent(/^80/);
    expect(screen.getByRole("combobox", { name: "Danger %" })).toHaveTextContent(/^90/);
  });

  it("renders threshold selects with saved values", () => {
    const userWithThresholds: UserProfile = { ...mockUser, warningThreshold: 50, dangerThreshold: 75 };
    render(<ProfilePreferencesSection user={userWithThresholds} />);
    expect(screen.getByRole("combobox", { name: "Warning %" })).toHaveTextContent(/^50/);
    expect(screen.getByRole("combobox", { name: "Danger %" })).toHaveTextContent(/^75/);
  });

  it("danger options <= warning threshold are disabled", async () => {
    render(<ProfilePreferencesSection user={mockUser} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox", { name: "Danger %" }));
    const disabledOption = await screen.findByRole("option", { name: "80%" });
    expect(disabledOption).toHaveAttribute("aria-disabled", "true");
  });

  it("changing warning threshold auto-adjusts danger when invalid", async () => {
    render(<ProfilePreferencesSection user={mockUser} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox", { name: "Warning %" }));
    await user.click(await screen.findByRole("option", { name: "90%" }));
    expect(screen.getByRole("combobox", { name: "Danger %" })).toHaveTextContent(/^100/);
  });

  it("Save enabled after changing warning threshold", async () => {
    render(<ProfilePreferencesSection user={mockUser} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox", { name: "Warning %" }));
    await user.click(await screen.findByRole("option", { name: "50%" }));
    expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
  });

  it("both threshold fields sent in patch when either changes", async () => {
    render(<ProfilePreferencesSection user={mockUser} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox", { name: "Warning %" }));
    await user.click(await screen.findByRole("option", { name: "50%" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(vi.mocked(actions.updateProfile)).toHaveBeenCalledWith({ warningThreshold: 50, dangerThreshold: 90 });
  });

  it("changing danger threshold marks dirty", async () => {
    render(<ProfilePreferencesSection user={mockUser} />);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox", { name: "Danger %" }));
    await user.click(await screen.findByRole("option", { name: "100%" }));
    expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
  });

  it("existing field functionality preserved alongside Budget section", async () => {
    render(<ProfilePreferencesSection user={mockUser} />);
    await userEvent.click(screen.getByRole("button", { name: "Day/Month" }));
    expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(vi.mocked(actions.updateProfile)).toHaveBeenCalledWith({ dateFormat: "DD/MM/YYYY" });
  });
});
