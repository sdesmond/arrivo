// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PackingRail } from "./packing-rail";
import type { PackingItem } from "@/data/types";

const items: PackingItem[] = [
  { id: "1", name: "Passport", done: true },
  { id: "2", name: "Sunscreen", done: false },
  { id: "3", name: "Camera", done: false },
  { id: "4", name: "Adapter", done: true },
  { id: "5", name: "Guidebook", done: false },
  { id: "6", name: "Headphones", done: false },
  { id: "7", name: "Notebook", done: false },
];

describe("PackingRail", () => {
  it("renders packing item names", () => {
    render(<PackingRail items={items.slice(0, 3)} />);
    expect(screen.getByText("Passport")).toBeInTheDocument();
    expect(screen.getByText("Sunscreen")).toBeInTheDocument();
    expect(screen.getByText("Camera")).toBeInTheDocument();
  });

  it("renders at most 6 items regardless of list length", () => {
    render(<PackingRail items={items} />);
    expect(screen.getByText("Passport")).toBeInTheDocument();
    expect(screen.getByText("Headphones")).toBeInTheDocument();
    expect(screen.queryByText("Notebook")).not.toBeInTheDocument();
  });

  it("done items have line-through text decoration", () => {
    render(<PackingRail items={items.slice(0, 2)} />);
    const passportEl = screen.getByText("Passport");
    expect(passportEl).toHaveStyle({ textDecoration: "line-through" });
    const sunscreenEl = screen.getByText("Sunscreen");
    expect(sunscreenEl).toHaveStyle({ textDecoration: "none" });
  });

  it("done items have reduced opacity", () => {
    render(<PackingRail items={items.slice(0, 2)} />);
    const passportRow = screen.getByText("Passport").closest("[style*='opacity']");
    expect(passportRow).toHaveStyle({ opacity: "0.55" });
  });

  it("shows packed count in header meta", () => {
    render(<PackingRail items={items.slice(0, 4)} />);
    // 2 done out of 4 — meta text is "2 / 4 PACKED"
    expect(screen.getByText(/2 \/ 4 PACKED/i)).toBeInTheDocument();
  });

  it("renders empty list without errors", () => {
    const { container } = render(<PackingRail items={[]} />);
    expect(container).toBeInTheDocument();
    expect(screen.getByText(/0 \/ 0 PACKED/i)).toBeInTheDocument();
  });
});
