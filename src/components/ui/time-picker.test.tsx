import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { TimePicker } from "./time-picker";

function getInput() {
  return document.querySelector('input[type="time"]') as HTMLInputElement;
}

describe("TimePicker", () => {
  let onChange: (value: string | undefined) => void;

  beforeEach(() => {
    onChange = vi.fn();
    vi.clearAllMocks();
  });

  it("renders a time input with empty value when none given", () => {
    render(<TimePicker onChange={onChange} />);
    expect(getInput()).not.toBeNull();
    expect(getInput().value).toBe("");
  });

  it("displays the given value", () => {
    render(<TimePicker value="09:30" onChange={onChange} />);
    expect(getInput().value).toBe("09:30");
  });

  it("calls onChange with the new value on change", () => {
    render(<TimePicker value="09:00" onChange={onChange} />);
    fireEvent.change(getInput(), { target: { value: "21:00" } });
    expect(onChange).toHaveBeenCalledWith("21:00");
  });

  it("calls onChange(undefined) when input is cleared", () => {
    render(<TimePicker value="09:30" onChange={onChange} />);
    fireEvent.change(getInput(), { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("passes disabled prop to the input", () => {
    render(<TimePicker onChange={onChange} disabled />);
    expect(getInput().disabled).toBe(true);
  });
});
