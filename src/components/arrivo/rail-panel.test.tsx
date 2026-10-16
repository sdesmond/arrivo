import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RailPanel } from "./rail-panel";

describe("RailPanel", () => {
  it("renders header text", () => {
    render(<RailPanel header="Documents">content</RailPanel>);
    expect(screen.getByText("Documents")).toBeInTheDocument();
  });

  it("renders children", () => {
    render(
      <RailPanel header="Docs">
        <span data-testid="child">child content</span>
      </RailPanel>
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("renders meta text when provided", () => {
    render(
      <RailPanel header="Docs" meta="3 items">
        content
      </RailPanel>
    );
    expect(screen.getByText("3 items")).toBeInTheDocument();
  });

  it("does not render meta when not provided", () => {
    render(<RailPanel header="Docs">content</RailPanel>);
    expect(screen.queryByText("3 items")).not.toBeInTheDocument();
  });
});
