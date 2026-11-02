import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SUPPORT_LINKS, SupportArrivoCard } from "./support-arrivo-card";

describe("SupportArrivoCard", () => {
  it("renders a labelled region explaining why support matters", () => {
    render(<SupportArrivoCard />);
    const region = screen.getByRole("region", { name: "Support Arrivo" });
    expect(region).toHaveTextContent(/free, open-source/i);
  });

  it.each([
    [/Sponsor on GitHub/, "https://github.com/sponsors/sdesmond"],
    [/Tip on Ko-fi/, "https://ko-fi.com/arrivo"],
  ])("links %s to %s in a new tab without leaking the opener", (name, href) => {
    render(<SupportArrivoCard />);
    const link = screen.getByRole("link", { name });
    expect(link).toHaveAttribute("href", href);
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
