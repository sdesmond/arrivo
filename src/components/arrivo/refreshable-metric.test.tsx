import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Metric } from "@/lib/overview-metric";
import { RefreshableMetric } from "./refreshable-metric";
import { MetricRow } from "./metric-row";

const checkedAt = "2026-10-31T12:00:00.000Z";
const later = "2026-10-31T12:01:00.000Z";
function mount(initialMetric: Metric<string | number>, refresh: () => Promise<Metric<string | number>>) {
  return render(
    <dl>
      <RefreshableMetric label="Users" initialMetric={initialMetric} refresh={refresh}>
        {(metric, controls, stale) => <MetricRow label="Users" metric={metric} controls={controls} stale={stale} />}
      </RefreshableMetric>
    </dl>
  );
}
describe("RefreshableMetric", () => {
  it("retains last success through unavailable and transport failures, then recovers with zero", async () => {
    const refresh = vi
      .fn()
      .mockResolvedValueOnce({ status: "unavailable", checkedAt: later })
      .mockRejectedValueOnce(new Error("private detail"))
      .mockResolvedValueOnce({ status: "ok", value: 0, checkedAt: later });
    mount({ status: "ok", value: 4, checkedAt }, refresh);
    fireEvent.click(screen.getByRole("button", { name: "Refresh Users" }));
    await screen.findByText("Stale");
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText(/^Checked/)).toHaveAttribute("datetime", checkedAt);
    fireEvent.click(screen.getByRole("button", { name: "Retry Users" }));
    await screen.findByText("Users could not be refreshed. Previous value is stale.");
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText(/^Checked/)).toHaveAttribute("datetime", checkedAt);
    expect(screen.queryByText(/private detail/)).not.toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Retry Users" })));
    expect(screen.queryByText("Stale")).not.toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText(/^Checked/)).toHaveAttribute("datetime", later);
    expect(screen.getByRole("button", { name: "Refresh Users" })).toBeEnabled();
  });
  it("keeps initial unavailable through failures and accepts empty success", async () => {
    const refresh = vi
      .fn()
      .mockRejectedValueOnce(new Error("private"))
      .mockResolvedValueOnce({ status: "unavailable", checkedAt: later })
      .mockResolvedValueOnce({ status: "ok", value: "", checkedAt: later });
    mount({ status: "unavailable", checkedAt }, refresh);
    for (let i = 0; i < 2; i++) {
      await act(async () => fireEvent.click(screen.getByRole("button", { name: "Retry Users" })));
      expect(screen.getByText("Unavailable")).toBeInTheDocument();
      expect(screen.queryByText("Stale")).not.toBeInTheDocument();
    }
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Retry Users" })));
    expect(screen.queryByText("Unavailable")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Users refreshed.");
  });
  it("announces pending and suppresses duplicate activation", async () => {
    let finish!: (metric: Metric<string | number>) => void;
    const refresh = vi.fn(
      () =>
        new Promise<Metric<string | number>>((resolve) => {
          finish = resolve;
        })
    );
    mount({ status: "ok", value: 4, checkedAt }, refresh);
    const button = screen.getByRole("button", { name: "Refresh Users" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(refresh).toHaveBeenCalledOnce();
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Refreshing Users…");
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    await act(async () => finish({ status: "ok", value: 5, checkedAt: later }));
    expect(button).toBeEnabled();
    expect(screen.getByText("5")).toBeInTheDocument();
  });
});
