import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DayRouteStrip } from "./day-route-strip";

describe("DayRouteStrip", () => {
  it("renders only a neutral skeleton thumbnail while loading", () => {
    render(<DayRouteStrip summary={{ status: "loading" }} tripId="trip-1" dayNumber={1} tripTransitMode="drive" />);

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
      />
    );

    expect(screen.getByText("1.3 km")).toBeInTheDocument();
    expect(screen.getByText(/1 hr 5 min.*drive/i)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Route overview for day 1" })).toHaveClass("min-h-11", "min-w-11");
  });

  it("renders a muted unavailable message without a route line", () => {
    render(<DayRouteStrip summary={{ status: "unavailable" }} tripId="trip-1" dayNumber={1} tripTransitMode="walk" />);

    expect(screen.getByText("Route unavailable")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Route unavailable for day 1" })).toBeInTheDocument();
  });
});
