// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TripEditDestination } from "./trip-edit-destination";

describe("TripEditDestination", () => {
  it("renders the destination details when present", () => {
    render(<TripEditDestination destinationName="Tokyo" destinationCountry="Japan" />);

    expect(screen.getByText("Tokyo")).toBeInTheDocument();
    expect(screen.getByText("Country")).toBeInTheDocument();
    expect(screen.getByText("Japan")).toBeInTheDocument();
  });

  it("renders nothing when both destination fields are absent", () => {
    const { container } = render(<TripEditDestination destinationName={undefined} destinationCountry={undefined} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders only the available destination field", () => {
    render(<TripEditDestination destinationName="Tokyo" destinationCountry={undefined} />);

    expect(screen.getAllByText("Destination").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Tokyo")).toBeInTheDocument();
    expect(screen.queryByText("Country")).not.toBeInTheDocument();
  });
});
