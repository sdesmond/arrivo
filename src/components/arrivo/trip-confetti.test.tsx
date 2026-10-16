import { render, waitFor } from "@testing-library/react";
import confetti from "canvas-confetti";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TripConfetti } from "./trip-confetti";

vi.mock("canvas-confetti", () => ({
  default: vi.fn(),
}));

describe("TripConfetti", () => {
  const replaceStateSpy = vi.spyOn(window.history, "replaceState").mockImplementation(() => {});

  afterEach(() => {
    vi.clearAllMocks();
    window.history.pushState(null, "", "/");
  });

  it("fires confetti exactly once after mounting", async () => {
    render(<TripConfetti tripId="abc" />);

    await waitFor(() => {
      expect(confetti).toHaveBeenCalledTimes(1);
    });
  });

  it("strips the new query parameter from the URL after firing", async () => {
    window.history.pushState(null, "", "/trips/abc?new=1&tab=docs&focus=event-1");

    render(<TripConfetti tripId="abc" />);

    await waitFor(() => {
      expect(replaceStateSpy).toHaveBeenCalledWith(null, "", "/trips/abc?tab=docs&focus=event-1");
    });
  });

  it("renders no DOM output", () => {
    const { container } = render(<TripConfetti tripId="abc" />);

    expect(container).toBeEmptyDOMElement();
  });
});
