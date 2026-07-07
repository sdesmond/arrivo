import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DestinationBreakdownDonut } from "./destination-breakdown-donut";

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

describe("DestinationBreakdownDonut", () => {
  it("renders segments for each destination in sorted order (largest total first)", () => {
    const { container } = render(
      <DestinationBreakdownDonut
        data={[
          { countryCode: "US", countryName: "United States", total: 100 },
          { countryCode: "JP", countryName: "Japan", total: 500 },
          { countryCode: "FR", countryName: "France", total: 50 },
        ]}
        formatCurrency={formatCurrency}
      />
    );

    const names = [...container.querySelectorAll('[data-slot="donut-chart-legend-item"] > span:nth-child(2)')].map(
      (item) => item.textContent
    );
    expect(names[0]).toBe("Japan");
    expect(names[1]).toBe("United States");
    expect(names[2]).toBe("France");
  });

  it("renders all segments including 'Unknown'", () => {
    const { container } = render(
      <DestinationBreakdownDonut
        data={[
          { countryCode: "US", countryName: "United States", total: 100 },
          { countryCode: null, countryName: "Unknown", total: 50 },
        ]}
        formatCurrency={formatCurrency}
      />
    );

    const names = [...container.querySelectorAll('[data-slot="donut-chart-legend-item"]')].map(
      (item) => item.textContent
    );
    expect(names.some((name) => name?.includes("Unknown"))).toBe(true);
  });

  it("Unknown segment uses var(--fg-4) color", () => {
    const { container } = render(
      <DestinationBreakdownDonut
        data={[{ countryCode: null, countryName: "Unknown", total: 50 }]}
        formatCurrency={formatCurrency}
      />
    );

    const swatch = container.querySelector('[data-slot="donut-chart-legend-item"] span[aria-hidden]');
    expect(swatch).toHaveAttribute("style", expect.stringContaining("var(--fg-4)"));
  });

  it("non-Unknown segments use cycling var(--chart-N) colors (wraps after 11)", () => {
    const data = Array.from({ length: 12 }, (unused, index) => ({
      countryCode: `C${index}`,
      countryName: `Country ${index}`,
      total: 100 - index,
    }));

    const { container } = render(<DestinationBreakdownDonut data={data} formatCurrency={formatCurrency} />);

    const swatches = [...container.querySelectorAll('[data-slot="donut-chart-legend-item"] span[aria-hidden]')];
    expect(swatches[0]).toHaveAttribute("style", expect.stringContaining("var(--chart-1)"));
    expect(swatches[10]).toHaveAttribute("style", expect.stringContaining("var(--chart-11)"));
    expect(swatches[11]).toHaveAttribute("style", expect.stringContaining("var(--chart-1)"));
  });

  it("generates accessibleLabel summarizing all segments including Unknown", () => {
    render(
      <DestinationBreakdownDonut
        data={[
          { countryCode: "US", countryName: "United States", total: 2400 },
          { countryCode: "JP", countryName: "Japan", total: 1100 },
          { countryCode: null, countryName: "Unknown", total: 50 },
        ]}
        formatCurrency={formatCurrency}
      />
    );

    expect(
      screen.getByRole("img", {
        name: "Destination breakdown donut chart: United States $2400.00, Japan $1100.00, Unknown $50.00",
      })
    ).toBeInTheDocument();
  });

  it("renders a 'Countries' title", () => {
    render(
      <DestinationBreakdownDonut
        data={[{ countryCode: "US", countryName: "United States", total: 100 }]}
        formatCurrency={formatCurrency}
      />
    );

    expect(screen.getByRole("heading", { name: "Countries" })).toBeInTheDocument();
  });

  it("renders inside chart-card wrapper", () => {
    const { container } = render(
      <DestinationBreakdownDonut
        data={[{ countryCode: "US", countryName: "United States", total: 100 }]}
        formatCurrency={formatCurrency}
      />
    );

    expect(container.querySelector('[data-slot="chart-card"]')).toBeInTheDocument();
  });

  it("empty data renders nothing", () => {
    const { container } = render(<DestinationBreakdownDonut data={[]} formatCurrency={formatCurrency} />);

    expect(container).toBeEmptyDOMElement();
  });
});
