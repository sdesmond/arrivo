import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DocsRail } from "./docs-rail";
import type { DocRailItem } from "./docs-rail";

const baseDocs: DocRailItem[] = [{ name: "Itinerary.pdf" }, { name: "Hotels.pdf" }, { name: "Flights.pdf" }];

describe("DocsRail", () => {
  it("renders the first doc name", () => {
    render(<DocsRail docs={baseDocs} />);
    expect(screen.getByText("Itinerary.pdf")).toBeInTheDocument();
  });

  it("shows only up to 5 items when more than 5 provided", () => {
    const many: DocRailItem[] = Array.from({ length: 7 }, (_, i) => ({
      name: `Doc ${i + 1}.pdf`,
    }));
    render(<DocsRail docs={many} />);
    expect(screen.getByText("Doc 1.pdf")).toBeInTheDocument();
    expect(screen.queryByText("Doc 6.pdf")).not.toBeInTheDocument();
  });

  it("renders 'View all' button", () => {
    render(<DocsRail docs={baseDocs} />);
    expect(screen.getByRole("button", { name: /view all/i })).toBeInTheDocument();
  });

  it("renders subtitle when provided", () => {
    const docs: DocRailItem[] = [{ name: "Guide.pdf", subtitle: "12 pages" }];
    render(<DocsRail docs={docs} />);
    expect(screen.getByText("12 pages")).toBeInTheDocument();
  });
});
