import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("./actions", () => ({
  updateCompanion: vi.fn().mockResolvedValue(undefined),
  deleteCompanion: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/components/ui/date-picker", () => ({
  DatePicker: ({
    value,
    onChange,
  }: {
    value?: string;
    onChange: (v: string | undefined) => void;
    placeholder?: string;
  }) => (
    <input
      data-testid="date-picker"
      type="text"
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value || undefined)}
    />
  ),
}));

vi.mock("@/components/packt/form-section", () => ({
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

import { CompanionRow } from "./companion-row";
import type { Companion } from "@/data/types";

const baseCompanion: Companion = {
  id: "c1",
  name: "Alice Travel",
  age: 30,
  passportNumber: "PA001",
  passportExpiry: "2028-06-01",
  passportNationality: "American",
  knownTravelerNumber: undefined,
  packtUsername: undefined,
  position: 0,
};

describe("CompanionRow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders companion name in collapsed state", () => {
    render(<CompanionRow companion={baseCompanion} />);
    expect(screen.getByText("Alice Travel")).toBeInTheDocument();
    expect(screen.queryByTestId("date-picker")).not.toBeInTheDocument();
  });

  it("renders companion age alongside name", () => {
    render(<CompanionRow companion={baseCompanion} />);
    expect(screen.getByText("(30)")).toBeInTheDocument();
  });

  it("expands to show edit form on Edit button click", async () => {
    const user = userEvent.setup();
    render(<CompanionRow companion={baseCompanion} />);
    await user.click(screen.getByRole("button", { name: /edit alice travel/i }));
    expect(screen.getByTestId("date-picker")).toBeInTheDocument();
  });

  it("shows pre-filled passport expiry in DatePicker after expand", async () => {
    const user = userEvent.setup();
    render(<CompanionRow companion={baseCompanion} />);
    await user.click(screen.getByRole("button", { name: /edit alice travel/i }));
    expect(screen.getByDisplayValue("2028-06-01")).toBeInTheDocument();
  });

  it("collapses form when Cancel is clicked", async () => {
    const user = userEvent.setup();
    render(<CompanionRow companion={baseCompanion} />);
    await user.click(screen.getByRole("button", { name: /edit alice travel/i }));
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByTestId("date-picker")).not.toBeInTheDocument();
  });

  it("calls updateCompanion with patch on Save", async () => {
    const { updateCompanion } = await import("./actions");
    const user = userEvent.setup();
    render(<CompanionRow companion={baseCompanion} />);
    await user.click(screen.getByRole("button", { name: /edit alice travel/i }));
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    expect(updateCompanion).toHaveBeenCalledWith("c1", expect.objectContaining({ name: "Alice Travel" }));
  });

  it("calls updateCompanion with updated expiry from DatePicker", async () => {
    const { updateCompanion } = await import("./actions");
    const user = userEvent.setup();
    render(<CompanionRow companion={baseCompanion} />);
    await user.click(screen.getByRole("button", { name: /edit alice travel/i }));
    const datePicker = screen.getByTestId("date-picker");
    await user.clear(datePicker);
    await user.type(datePicker, "2031-12-31");
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    expect(updateCompanion).toHaveBeenCalledWith("c1", expect.objectContaining({ passportExpiry: "2031-12-31" }));
  });

  it("calls deleteCompanion when Remove button is clicked", async () => {
    const { deleteCompanion } = await import("./actions");
    const user = userEvent.setup();
    render(<CompanionRow companion={baseCompanion} />);
    await user.click(screen.getByRole("button", { name: /remove alice travel/i }));
    expect(deleteCompanion).toHaveBeenCalledWith("c1");
  });

  it("Save button is disabled when name is cleared", async () => {
    const user = userEvent.setup();
    render(<CompanionRow companion={baseCompanion} />);
    await user.click(screen.getByRole("button", { name: /edit alice travel/i }));
    const nameInput = screen.getByDisplayValue("Alice Travel");
    await user.clear(nameInput);
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
  });

  it("shows toast error when updateCompanion returns an error", async () => {
    const { updateCompanion } = await import("./actions");
    const { toast } = await import("sonner");
    vi.mocked(updateCompanion).mockResolvedValueOnce({ error: "Companion name must be 50 characters or fewer." });
    const user = userEvent.setup();
    render(<CompanionRow companion={baseCompanion} />);
    await user.click(screen.getByRole("button", { name: /edit alice travel/i }));
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    expect(toast.error).toHaveBeenCalledWith("Companion name must be 50 characters or fewer.");
  });

  it("shows name error and disables Save when name exceeds 50 chars (AC2)", async () => {
    const user = userEvent.setup();
    render(<CompanionRow companion={baseCompanion} />);
    await user.click(screen.getByRole("button", { name: /edit alice travel/i }));
    const nameInput = screen.getByDisplayValue("Alice Travel");
    fireEvent.change(nameInput, { target: { value: "A".repeat(51) } });
    expect(screen.getByRole("alert")).toHaveTextContent("Companion name must be 50 characters or fewer.");
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
  });

  it("clears name error when name is corrected (AC2)", async () => {
    const user = userEvent.setup();
    render(<CompanionRow companion={baseCompanion} />);
    await user.click(screen.getByRole("button", { name: /edit alice travel/i }));
    const nameInput = screen.getByDisplayValue("Alice Travel");
    fireEvent.change(nameInput, { target: { value: "A".repeat(51) } });
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.change(nameInput, { target: { value: "Alice" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows age error when age is out of range (AC3)", async () => {
    const user = userEvent.setup();
    render(<CompanionRow companion={baseCompanion} />);
    await user.click(screen.getByRole("button", { name: /edit alice travel/i }));
    const ageInput = screen.getByDisplayValue("30");
    await user.clear(ageInput);
    await user.type(ageInput, "999");
    expect(screen.getByRole("alert")).toHaveTextContent("Age must be between 0 and 120.");
  });

  it("clears age error when age field is cleared (AC3)", async () => {
    const user = userEvent.setup();
    render(<CompanionRow companion={baseCompanion} />);
    await user.click(screen.getByRole("button", { name: /edit alice travel/i }));
    const ageInput = screen.getByDisplayValue("30");
    await user.clear(ageInput);
    await user.type(ageInput, "999");
    expect(screen.getByRole("alert")).toBeInTheDocument();
    await user.clear(ageInput);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows passport number error when passport exceeds 20 chars (AC4)", async () => {
    const user = userEvent.setup();
    render(<CompanionRow companion={baseCompanion} />);
    await user.click(screen.getByRole("button", { name: /edit alice travel/i }));
    const passportInput = screen.getByDisplayValue("PA001");
    fireEvent.change(passportInput, { target: { value: "A".repeat(21) } });
    expect(screen.getByRole("alert")).toHaveTextContent("Passport number must be 20 characters or fewer.");
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
  });

  it("clears passport error when corrected (AC4)", async () => {
    const user = userEvent.setup();
    render(<CompanionRow companion={baseCompanion} />);
    await user.click(screen.getByRole("button", { name: /edit alice travel/i }));
    const passportInput = screen.getByDisplayValue("PA001");
    fireEvent.change(passportInput, { target: { value: "A".repeat(21) } });
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.change(passportInput, { target: { value: "A12345678" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
