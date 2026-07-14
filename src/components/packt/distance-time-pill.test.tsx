import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DistanceTimePill } from "./distance-time-pill";
import type { RouteResult } from "@/data/types";

describe("DistanceTimePill", () => {
  it("renders a neutral skeleton fill and no text when loading", () => {
    render(<DistanceTimePill eventName="Louvre Museum" routeResult={{ status: "loading" }} transitMode="walk" />);
    const pill = screen.getByRole("button", { name: "Getting directions to Louvre Museum" });
    expect(pill).toBeDisabled();
    expect(pill).toHaveStyle({ background: "var(--surface-2)", color: "var(--fg-3)" });
    expect(pill.textContent?.trim()).toBe("");
  });

  it("renders distance/time text when ready", () => {
    const routeResult: RouteResult = { status: "ready", distanceMeters: 950, durationSeconds: 720 };
    render(<DistanceTimePill eventName="Louvre Museum" routeResult={routeResult} transitMode="walk" />);
    expect(screen.getByText("12 min walk")).toBeInTheDocument();
  });

  it("renders error text and stays tappable when unavailable", () => {
    render(<DistanceTimePill eventName="Louvre Museum" routeResult={{ status: "unavailable" }} transitMode="drive" />);
    expect(screen.getByText("Couldn't get directions — try again.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Couldn't get directions to Louvre Museum" })).toBeEnabled();
  });

  it("calls onClick when tapped in the ready state", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const routeResult: RouteResult = { status: "ready", distanceMeters: 950, durationSeconds: 720 };
    render(
      <DistanceTimePill eventName="Louvre Museum" routeResult={routeResult} transitMode="walk" onClick={onClick} />
    );
    await user.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("calls onClick when tapped in the unavailable state", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <DistanceTimePill
        eventName="Louvre Museum"
        routeResult={{ status: "unavailable" }}
        transitMode="walk"
        onClick={onClick}
      />
    );
    await user.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
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
      expect(screen.getByRole("button").getAttribute("aria-label")).toContain("Louvre Museum");
      unmount();
    }
  });

  it("meets the 44x44px minimum interactive target in every state", () => {
    const states: RouteResult[] = [
      { status: "loading" },
      { status: "ready", distanceMeters: 950, durationSeconds: 720 },
      { status: "unavailable" },
    ];
    for (const routeResult of states) {
      const { unmount } = render(
        <DistanceTimePill eventName="Louvre Museum" routeResult={routeResult} transitMode="walk" />
      );
      const pill = screen.getByRole("button");
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
