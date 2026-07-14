import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DistanceTimePill } from "./distance-time-pill";
import type { RouteResult } from "@/data/types";

describe("DistanceTimePill", () => {
  it("renders a neutral skeleton fill and no text when loading", () => {
    render(<DistanceTimePill eventName="Louvre Museum" routeResult={{ status: "loading" }} transitMode="walk" />);
    const pill = screen.getByRole("status", { name: "Getting directions to Louvre Museum" });
    expect(pill).not.toHaveAttribute("tabindex");
    expect(pill).toHaveStyle({ background: "var(--surface-2)", color: "var(--fg-3)" });
    expect(pill.textContent?.trim()).toBe("");
  });

  it("renders live distance and time when ready", () => {
    const routeResult: RouteResult = { status: "ready", distanceMeters: 950, durationSeconds: 720 };
    render(<DistanceTimePill eventName="Louvre Museum" routeResult={routeResult} transitMode="walk" />);
    expect(screen.getByText("950 m · 12 min walk")).toBeInTheDocument();
  });

  it("renders error text as display-only status when unavailable", () => {
    render(<DistanceTimePill eventName="Louvre Museum" routeResult={{ status: "unavailable" }} transitMode="drive" />);
    expect(screen.getByText("Couldn't get directions — try again.")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Couldn't get directions to Louvre Museum" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("has an accessible name containing the event name in every state", () => {
    const states: RouteResult[] = [
      { status: "loading" },
      { status: "ready", distanceMeters: 950, durationSeconds: 720 },
      { status: "unavailable" },
    ];
    for (const routeResult of states) {
      const { unmount } = render(
        <DistanceTimePill eventName="Louvre Museum" routeResult={routeResult} transitMode="walk" />
      );
      expect(screen.getByRole("status").getAttribute("aria-label")).toContain("Louvre Museum");
      unmount();
    }
  });

  it("keeps a consistent pill footprint in every state", () => {
    const states: RouteResult[] = [
      { status: "loading" },
      { status: "ready", distanceMeters: 950, durationSeconds: 720 },
      { status: "unavailable" },
    ];
    for (const routeResult of states) {
      const { unmount } = render(
        <DistanceTimePill eventName="Louvre Museum" routeResult={routeResult} transitMode="walk" />
      );
      const pill = screen.getByRole("status");
      expect(pill.className).toMatch(/\bh-11\b/);
      expect(pill.className).toMatch(/\bmin-w-11\b/);
      unmount();
    }
  });

  it("never renders stale, zero, or dashed values during loading", () => {
    render(<DistanceTimePill eventName="Louvre Museum" routeResult={{ status: "loading" }} transitMode="walk" />);
    expect(screen.queryByText(/0 min/)).not.toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
    expect(screen.queryByText(/min/)).not.toBeInTheDocument();
  });
});
