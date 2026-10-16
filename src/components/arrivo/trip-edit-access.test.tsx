import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TripEditAccessProvider, useCanEditTrip } from "@/components/arrivo/trip-edit-access";

function AccessProbe() {
  return <span>{useCanEditTrip() ? "can edit" : "read only"}</span>;
}

describe("useCanEditTrip", () => {
  it("allows editing outside a provider so standalone usages keep their controls", () => {
    render(<AccessProbe />);
    expect(screen.getByText("can edit")).toBeInTheDocument();
  });

  it("reports read-only inside a provider that denies editing", () => {
    render(
      <TripEditAccessProvider canEdit={false}>
        <AccessProbe />
      </TripEditAccessProvider>
    );
    expect(screen.getByText("read only")).toBeInTheDocument();
  });

  it("reports editable inside a provider that allows editing", () => {
    render(
      <TripEditAccessProvider canEdit>
        <AccessProbe />
      </TripEditAccessProvider>
    );
    expect(screen.getByText("can edit")).toBeInTheDocument();
  });
});
