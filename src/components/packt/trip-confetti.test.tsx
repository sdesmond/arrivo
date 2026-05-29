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
  });

  it("fires confetti exactly once after mounting", async () => {
    render(<TripConfetti tripId="abc" />);

    await waitFor(() => {
      expect(confetti).toHaveBeenCalledTimes(1);
    });
  });

  it("strips the new query parameter from the URL after firing", async () => {
    render(<TripConfetti tripId="abc" />);

    await waitFor(() => {
      expect(replaceStateSpy).toHaveBeenCalledWith(null, "", "/trips/abc");
    });
  });

  it("renders no DOM output", () => {
    const { container } = render(<TripConfetti tripId="abc" />);

    expect(container).toBeEmptyDOMElement();
  });
});
