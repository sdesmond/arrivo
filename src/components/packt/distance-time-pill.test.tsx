import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DistanceTimePill } from "./distance-time-pill";
import type { GeoHintStatus, RouteResult } from "@/data/types";

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

  describe("interactive (onOpenMaps provided)", () => {
    const readyRoute: RouteResult = { status: "ready", distanceMeters: 950, durationSeconds: 720 };

    it("renders a type=button in the ready state", () => {
      render(
        <DistanceTimePill eventName="Louvre Museum" routeResult={readyRoute} transitMode="walk" onOpenMaps={vi.fn()} />
      );
      const pill = screen.getByRole("button");
      expect(pill).toHaveAttribute("type", "button");
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("renders a type=button in the unavailable state and keeps the error text", () => {
      render(
        <DistanceTimePill
          eventName="Louvre Museum"
          routeResult={{ status: "unavailable" }}
          transitMode="drive"
          onOpenMaps={vi.fn()}
        />
      );
      expect(screen.getByRole("button")).toHaveAttribute("type", "button");
      expect(screen.getByText("Couldn't get directions — try again.")).toBeInTheDocument();
    });

    it("stays a status (not a button) while loading, even with onOpenMaps", () => {
      render(
        <DistanceTimePill
          eventName="Louvre Museum"
          routeResult={{ status: "loading" }}
          transitMode="walk"
          onOpenMaps={vi.fn()}
        />
      );
      expect(screen.getByRole("status", { name: "Getting directions to Louvre Museum" })).toBeInTheDocument();
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });

    it("calls onOpenMaps when the ready pill is clicked", async () => {
      const user = userEvent.setup();
      const onOpenMaps = vi.fn();
      render(
        <DistanceTimePill
          eventName="Louvre Museum"
          routeResult={readyRoute}
          transitMode="walk"
          onOpenMaps={onOpenMaps}
        />
      );
      await user.click(screen.getByRole("button"));
      expect(onOpenMaps).toHaveBeenCalledTimes(1);
    });

    it("calls onOpenMaps when the unavailable pill is clicked", async () => {
      const user = userEvent.setup();
      const onOpenMaps = vi.fn();
      render(
        <DistanceTimePill
          eventName="Louvre Museum"
          routeResult={{ status: "unavailable" }}
          transitMode="walk"
          onOpenMaps={onOpenMaps}
        />
      );
      await user.click(screen.getByRole("button"));
      expect(onOpenMaps).toHaveBeenCalledTimes(1);
    });

    it("has the ready-state accessible name 'Open directions to {event}, {time} {mode}'", () => {
      render(
        <DistanceTimePill eventName="Louvre Museum" routeResult={readyRoute} transitMode="walk" onOpenMaps={vi.fn()} />
      );
      expect(screen.getByRole("button", { name: "Open directions to Louvre Museum, 12 min walk" })).toBeInTheDocument();
    });

    it("has the unavailable-state accessible name 'Open maps for {event}'", () => {
      render(
        <DistanceTimePill
          eventName="Louvre Museum"
          routeResult={{ status: "unavailable" }}
          transitMode="drive"
          onOpenMaps={vi.fn()}
        />
      );
      expect(screen.getByRole("button", { name: "Open maps for Louvre Museum" })).toBeInTheDocument();
    });

    it("keeps the 44x44 pill footprint in every interactive state", () => {
      const states: RouteResult[] = [readyRoute, { status: "unavailable" }];
      for (const routeResult of states) {
        const { unmount } = render(
          <DistanceTimePill
            eventName="Louvre Museum"
            routeResult={routeResult}
            transitMode="walk"
            onOpenMaps={vi.fn()}
          />
        );
        const pill = screen.getByRole("button");
        expect(pill.className).toMatch(/\bh-11\b/);
        expect(pill.className).toMatch(/\bmin-w-11\b/);
        unmount();
      }
    });
  });

  it("stays a display-only status in the ready state when onOpenMaps is absent (backward compat)", () => {
    const routeResult: RouteResult = { status: "ready", distanceMeters: 950, durationSeconds: 720 };
    render(<DistanceTimePill eventName="Louvre Museum" routeResult={routeResult} transitMode="walk" />);
    expect(
      screen.getByRole("status", { name: "Directions to Louvre Museum, 950 m · 12 min walk" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  describe("geo-hint state", () => {
    const promptHint: GeoHintStatus = { state: "prompt", permissionState: "prompt" };
    const deniedHint: GeoHintStatus = { state: "denied" };

    it("renders a button with surface-2/fg-3 styling when geolocationHint is prompt and routeResult is null", () => {
      render(
        <DistanceTimePill
          eventName="Louvre Museum"
          routeResult={null}
          transitMode="walk"
          geolocationHint={promptHint}
        />
      );
      const pill = screen.getByRole("button");
      expect(pill).toHaveStyle({ background: "var(--surface-2)", color: "var(--fg-3)" });
    });

    it("shows the 'Enable location for directions' label in prompt state", () => {
      render(
        <DistanceTimePill
          eventName="Louvre Museum"
          routeResult={null}
          transitMode="walk"
          geolocationHint={promptHint}
        />
      );
      expect(screen.getByText("Enable location for directions")).toBeInTheDocument();
    });

    it("has accessible name 'Enable location for directions to {event}' in prompt state", () => {
      render(
        <DistanceTimePill
          eventName="Louvre Museum"
          routeResult={null}
          transitMode="walk"
          geolocationHint={promptHint}
        />
      );
      expect(
        screen.getByRole("button", { name: "Enable location for directions to Louvre Museum" })
      ).toBeInTheDocument();
    });

    it("renders a button with surface-2/fg-3 styling when geolocationHint is denied and routeResult is null", () => {
      render(
        <DistanceTimePill
          eventName="Louvre Museum"
          routeResult={null}
          transitMode="walk"
          geolocationHint={deniedHint}
        />
      );
      const pill = screen.getByRole("button");
      expect(pill).toHaveStyle({ background: "var(--surface-2)", color: "var(--fg-3)" });
    });

    it("shows the 'Location blocked' label in denied state", () => {
      render(
        <DistanceTimePill
          eventName="Louvre Museum"
          routeResult={null}
          transitMode="walk"
          geolocationHint={deniedHint}
        />
      );
      expect(screen.getByText("Location blocked — enable it in your browser settings")).toBeInTheDocument();
    });

    it("includes the event name in the denied-state accessible name", () => {
      render(
        <DistanceTimePill
          eventName="Louvre Museum"
          routeResult={null}
          transitMode="walk"
          geolocationHint={deniedHint}
        />
      );
      expect(screen.getByRole("button").getAttribute("aria-label")).toContain("Louvre Museum");
    });

    it("calls onRequestGeolocation when the geo-hint pill is clicked", async () => {
      const user = userEvent.setup();
      const onRequestGeolocation = vi.fn();
      render(
        <DistanceTimePill
          eventName="Louvre Museum"
          routeResult={null}
          transitMode="walk"
          geolocationHint={promptHint}
          onRequestGeolocation={onRequestGeolocation}
        />
      );
      await user.click(screen.getByRole("button"));
      expect(onRequestGeolocation).toHaveBeenCalledTimes(1);
    });

    it("preserves the focused pill node while directions load after location is granted", () => {
      const { rerender } = render(
        <DistanceTimePill
          eventName="Louvre Museum"
          routeResult={null}
          transitMode="walk"
          geolocationHint={promptHint}
          onRequestGeolocation={vi.fn()}
          onOpenMaps={vi.fn()}
        />
      );
      const pill = screen.getByRole("button");
      pill.focus();

      rerender(
        <DistanceTimePill
          eventName="Louvre Museum"
          routeResult={{ status: "loading" }}
          transitMode="walk"
          onRequestGeolocation={vi.fn()}
          onOpenMaps={vi.fn()}
        />
      );

      expect(screen.getByRole("button", { name: "Getting directions to Louvre Museum" })).toBe(pill);
      expect(pill).toHaveFocus();
    });

    it("maintains the 44x44 pill footprint in geo-hint states", () => {
      const hints: GeoHintStatus[] = [promptHint, deniedHint];
      for (const geolocationHint of hints) {
        const { unmount } = render(
          <DistanceTimePill
            eventName="Louvre Museum"
            routeResult={null}
            transitMode="walk"
            geolocationHint={geolocationHint}
          />
        );
        const pill = screen.getByRole("button");
        expect(pill.className).toMatch(/\bh-11\b/);
        expect(pill.className).toMatch(/\bmin-w-11\b/);
        unmount();
      }
    });

    it("does not render the geo-hint when routeResult is non-null, even if geolocationHint is provided", () => {
      const routeResult: RouteResult = { status: "ready", distanceMeters: 950, durationSeconds: 720 };
      render(
        <DistanceTimePill
          eventName="Louvre Museum"
          routeResult={routeResult}
          transitMode="walk"
          geolocationHint={promptHint}
        />
      );
      expect(screen.queryByText("Enable location for directions")).not.toBeInTheDocument();
      expect(screen.getByText("950 m · 12 min walk")).toBeInTheDocument();
    });

    it("renders nothing when routeResult is null and geolocationHint is null (Freeform event)", () => {
      const { container } = render(
        <DistanceTimePill eventName="Louvre Museum" routeResult={null} transitMode="walk" geolocationHint={null} />
      );
      expect(container).toBeEmptyDOMElement();
    });

    it("renders nothing when routeResult is null and geolocationHint is not provided (backward compat)", () => {
      const { container } = render(
        <DistanceTimePill eventName="Louvre Museum" routeResult={null} transitMode="walk" />
      );
      expect(container).toBeEmptyDOMElement();
    });
  });
});
