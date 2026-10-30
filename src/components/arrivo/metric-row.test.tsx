import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MetricRow } from "./metric-row";

describe("MetricRow", () => {
  it("shows label, value and a checked time", () => {
    render(<MetricRow label="Users" metric={{ status: "ok", value: 4, checkedAt: "2026-10-30T12:00:00.000Z" }} />);
    expect(screen.getByText("Users")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    const time = screen.getByText(/Checked/);
    expect(time.tagName).toBe("TIME");
    expect(time).toHaveAttribute("datetime", "2026-10-30T12:00:00.000Z");
    expect(time).toHaveTextContent("Checked 12:00:00 UTC");
  });

  it("renders 0 as a valid value", () => {
    render(
      <MetricRow label="Pending setup" metric={{ status: "ok", value: 0, checkedAt: "2026-10-30T12:00:00.000Z" }} />
    );
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.queryByText("Unavailable")).not.toBeInTheDocument();
  });

  it("shows Unavailable with its checked time and no value", () => {
    render(<MetricRow label="Database" metric={{ status: "unavailable", checkedAt: "2026-10-30T12:00:00.000Z" }} />);
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Healthy")).not.toBeInTheDocument();
    expect(screen.getByText(/Checked/)).toHaveAttribute("datetime", "2026-10-30T12:00:00.000Z");
  });
});
