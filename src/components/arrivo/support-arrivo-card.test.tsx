import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SUPPORT_LINKS, SupportArrivoCard } from "./support-arrivo-card";

describe("SupportArrivoCard", () => {
  it("renders a labelled region explaining why support matters", () => {
    render(<SupportArrivoCard />);
    const region = screen.getByRole("region", { name: "Support Arrivo" });
    expect(region).toHaveTextContent(/free, open-source/i);
  });

  it("links to GitHub Sponsors in a new tab without leaking the opener", () => {
    render(<SupportArrivoCard />);
    const link = screen.getByRole("link", { name: /Sponsor on GitHub/ });
    expect(link).toHaveAttribute("href", "https://github.com/sponsors/sdesmond");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders one 44px-tall link per configured destination", () => {
    render(<SupportArrivoCard />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(SUPPORT_LINKS.length);
    for (const link of links) expect(link).toHaveClass("min-h-11");
  });
});
