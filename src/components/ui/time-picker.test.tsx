// @vitest-environment jsdom
import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TimePicker } from "./time-picker";

vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    disabled,
    children,
  }: {
    value?: string;
    onValueChange?: (v: string) => void;
    disabled?: boolean;
    children?: React.ReactNode;
  }) => (
    <select value={value ?? ""} disabled={disabled} onChange={(e) => onValueChange?.(e.target.value)}>
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <option value="">{placeholder}</option>,
  SelectContent: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children?: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

describe("TimePicker", () => {
  let onChange: (value: string | undefined) => void;

  beforeEach(() => {
    onChange = vi.fn();
    vi.clearAllMocks();
  });

  it("renders all three selects empty when no value is given", () => {
    render(<TimePicker onChange={onChange} />);
    const [hourSelect, minuteSelect, periodSelect] = screen.getAllByRole("combobox");
    expect((hourSelect as HTMLSelectElement).value).toBe("");
    expect((minuteSelect as HTMLSelectElement).value).toBe("");
    expect((periodSelect as HTMLSelectElement).value).toBe("");
  });

  it("parses '09:30' and shows hour=9, minute=30, AM", () => {
    render(<TimePicker value="09:30" onChange={onChange} />);
    const [hourSelect, minuteSelect, periodSelect] = screen.getAllByRole("combobox");
    expect((hourSelect as HTMLSelectElement).value).toBe("9");
    expect((minuteSelect as HTMLSelectElement).value).toBe("30");
    expect((periodSelect as HTMLSelectElement).value).toBe("AM");
  });

  it("emits '21:00' when 9 PM is selected with minute 00", async () => {
    const user = userEvent.setup();
    render(<TimePicker value="09:00" onChange={onChange} />);
    const [, , periodSelect] = screen.getAllByRole("combobox");
    await user.selectOptions(periodSelect, "PM");
    expect(onChange).toHaveBeenCalledWith("21:00");
  });

  it("calls onChange(undefined) when Clear is clicked", async () => {
    const user = userEvent.setup();
    render(<TimePicker value="09:30" onChange={onChange} />);
    const clearBtn = screen.getByRole("button", { name: /clear time/i });
    await user.click(clearBtn);
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("does not show Clear button when value is undefined", () => {
    render(<TimePicker onChange={onChange} />);
    expect(screen.queryByRole("button", { name: /clear time/i })).not.toBeInTheDocument();
  });
});
