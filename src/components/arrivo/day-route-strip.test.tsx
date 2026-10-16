import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { DayRouteStrip } from "./day-route-strip";

describe("DayRouteStrip", () => {
  it("renders only a neutral skeleton thumbnail while loading", () => {
    render(
      <DayRouteStrip
        summary={{ status: "loading" }}
        tripId="trip-1"
        dayNumber={1}
        tripTransitMode="drive"
        totalHopCount={1}
      />
    );

    expect(screen.getByRole("img", { name: "Route loading" })).toHaveClass("min-h-11", "min-w-11");
    expect(screen.queryByText(/km|\bmin\b|\bhr\b/i)).not.toBeInTheDocument();
  });

  it("renders formatted distance, duration, and transit mode when ready", () => {
    render(
      <DayRouteStrip
        summary={{ status: "ready", totalDistanceMeters: 1250, totalDurationSeconds: 3900, hopCount: 2 }}
        tripId="trip-1"
        dayNumber={1}
        tripTransitMode="drive"
        totalHopCount={2}
      />
    );

    expect(screen.getByText("1.3 km")).toBeInTheDocument();
    expect(screen.getByText(/1 hr 5 min.*drive/i)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Route overview for day 1" })).toHaveClass("min-h-11", "min-w-11");
  });

  it("marks the distance as partial when fewer hops resolved than the day has", () => {
    render(
      <DayRouteStrip
        summary={{ status: "ready", totalDistanceMeters: 1250, totalDurationSeconds: 3900, hopCount: 1 }}
        tripId="trip-1"
        dayNumber={1}
        tripTransitMode="drive"
        totalHopCount={3}
      />
    );

    expect(screen.getByText("~1.3 km")).toBeInTheDocument();
  });

  it("renders a muted unavailable message without a route line", () => {
    render(
      <DayRouteStrip
        summary={{ status: "unavailable" }}
        tripId="trip-1"
        dayNumber={1}
        tripTransitMode="walk"
        totalHopCount={1}
      />
    );

    expect(screen.getByText("Route unavailable")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Route unavailable for day 1" })).toBeInTheDocument();
  });

  it("renders the conflict badge when conflictCount is greater than zero", () => {
    render(
      <DayRouteStrip
        summary={{ status: "ready", totalDistanceMeters: 1250, totalDurationSeconds: 3900, hopCount: 2 }}
        tripId="trip-1"
        dayNumber={1}
        tripTransitMode="drive"
        totalHopCount={2}
        conflictCount={1}
      />
    );

    expect(screen.getByRole("button", { name: "1 tight connection today" })).toBeInTheDocument();
  });

  it("hides the conflict badge when conflictCount is zero or undefined", () => {
    const { container, rerender } = render(
      <DayRouteStrip
        summary={{ status: "ready", totalDistanceMeters: 1250, totalDurationSeconds: 3900, hopCount: 2 }}
        tripId="trip-1"
        dayNumber={1}
        tripTransitMode="drive"
        totalHopCount={2}
      />
    );

    expect(screen.queryByText(/tight connection/)).not.toBeInTheDocument();
    expect(container.querySelector('[aria-live="polite"]')).not.toBeInTheDocument();

    rerender(
      <DayRouteStrip
        summary={{ status: "ready", totalDistanceMeters: 1250, totalDurationSeconds: 3900, hopCount: 2 }}
        tripId="trip-1"
        dayNumber={1}
        tripTransitMode="drive"
        totalHopCount={2}
        conflictCount={0}
      />
    );

    expect(screen.queryByText(/tight connection/)).not.toBeInTheDocument();
    expect(container.querySelector('[aria-live="polite"]')).toBeInTheDocument();
  });

  it("calls onConflictClick when the conflict badge is clicked", async () => {
    const user = userEvent.setup();
    const onConflictClick = vi.fn();
    render(
      <DayRouteStrip
        summary={{ status: "ready", totalDistanceMeters: 1250, totalDurationSeconds: 3900, hopCount: 2 }}
        tripId="trip-1"
        dayNumber={1}
        tripTransitMode="drive"
        totalHopCount={2}
        conflictCount={2}
        onConflictClick={onConflictClick}
      />
    );

    await user.click(screen.getByRole("button", { name: "2 tight connections today" }));

    expect(onConflictClick).toHaveBeenCalledTimes(1);
  });

  it("renders the thumbnail as a button when onThumbnailClick is provided and data is ready", () => {
    render(
      <DayRouteStrip
        summary={{ status: "ready", totalDistanceMeters: 1250, totalDurationSeconds: 3900, hopCount: 2 }}
        tripId="trip-1"
        dayNumber={1}
        tripTransitMode="drive"
        totalHopCount={2}
        onThumbnailClick={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Route overview for day 1" })).toHaveClass("min-h-11", "min-w-11");
    expect(screen.queryByRole("img", { name: "Route overview for day 1" })).not.toBeInTheDocument();
  });

  it("renders the thumbnail as a non-interactive div when onThumbnailClick is not provided", () => {
    render(
      <DayRouteStrip
        summary={{ status: "ready", totalDistanceMeters: 1250, totalDurationSeconds: 3900, hopCount: 2 }}
        tripId="trip-1"
        dayNumber={1}
        tripTransitMode="drive"
        totalHopCount={2}
      />
    );

    expect(screen.getByRole("img", { name: "Route overview for day 1" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Route overview for day 1" })).not.toBeInTheDocument();
  });

  it("keeps the thumbnail non-interactive while loading, even when onThumbnailClick is provided", () => {
    render(
      <DayRouteStrip
        summary={{ status: "loading" }}
        tripId="trip-1"
        dayNumber={1}
        tripTransitMode="drive"
        totalHopCount={1}
        onThumbnailClick={vi.fn()}
      />
    );

    expect(screen.getByRole("img", { name: "Route loading" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Route loading" })).not.toBeInTheDocument();
  });

  it("calls onThumbnailClick when the thumbnail button is clicked", async () => {
    const user = userEvent.setup();
    const onThumbnailClick = vi.fn();
    render(
      <DayRouteStrip
        summary={{ status: "ready", totalDistanceMeters: 1250, totalDurationSeconds: 3900, hopCount: 2 }}
        tripId="trip-1"
        dayNumber={1}
        tripTransitMode="drive"
        totalHopCount={2}
        onThumbnailClick={onThumbnailClick}
      />
    );

    await user.click(screen.getByRole("button", { name: "Route overview for day 1" }));

    expect(onThumbnailClick).toHaveBeenCalledTimes(1);
  });
});
