import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MetricRow } from "./metric-row";

describe("MetricRow", () => {
  it("keeps stale value and checked time alongside optional controls", () => {
    render(
      <MetricRow
        label="Database"
        metric={{ status: "ok", value: "Healthy", checkedAt: "2026-10-30T12:00:00.000Z" }}
        stale
        controls={<button>Retry Database</button>}
      />
    );
    expect(screen.getByText("Stale")).toBeInTheDocument();
    expect(screen.getByText("Healthy")).toBeInTheDocument();
    expect(screen.getByText(/^Checked/)).toHaveAttribute("datetime", "2026-10-30T12:00:00.000Z");
    expect(screen.getByRole("button", { name: "Retry Database" })).toBeInTheDocument();
  });
  it.each([
    [0, "0 bytes"],
    [999, "999 bytes"],
    [1000, "1.00 KB"],
    [1000000, "1.00 MB"],
    [6237721, "6.24 MB"],
    [1000000000, "1.00 GB"],
    [2345678901, "2.35 GB"],
    [1000000000000, "1.00 TB"],
    [1000000000000000, "1.00 PB"],
  ])("formats %i bytes as %s with exact bytes on hover", (bytes, display) => {
    render(
      <MetricRow
        label="Upload storage"
        format="bytes"
        metric={{ status: "ok", value: bytes, checkedAt: "2026-10-30T12:00:00.000Z" }}
      />
    );
    expect(screen.getByText(display)).toHaveAttribute("title", `${bytes} bytes`);
  });

  it("does not expose a byte value when usage is unavailable", () => {
    render(
      <MetricRow
        label="Upload storage"
        format="bytes"
        metric={{ status: "unavailable", checkedAt: "2026-10-30T12:00:00.000Z" }}
      />
    );
    expect(screen.getByText("Unavailable")).not.toHaveAttribute("title");
  });

  it("preserves string metrics when byte formatting is requested", () => {
    render(
      <MetricRow
        label="Version"
        format="bytes"
        metric={{ status: "ok", value: "1.0.0", checkedAt: "2026-10-30T12:00:00.000Z" }}
      />
    );
    expect(screen.getByText("1.0.0")).not.toHaveAttribute("title");
  });

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
