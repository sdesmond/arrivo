import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlaceRowActionBar } from "./place-row-action-bar";
import type { TripEvent } from "@/data/types";

const basePlace: TripEvent = {
  id: "ev-1",
  name: "Tokyo Tower",
  position: 0,
};

const defaultProps = {
  place: basePlace,
  showDocs: false,
  onToggleDocs: vi.fn(),
  onOpenTime: vi.fn(),
  onOpenLocation: vi.fn(),
  onOpenCost: vi.fn(),
  onOpenAddDoc: vi.fn(),
};

describe("PlaceRowActionBar", () => {
  it("shows 'Add time' when no startAt", () => {
    render(<PlaceRowActionBar {...defaultProps} />);
    expect(screen.getByRole("button", { name: /add time/i })).toBeInTheDocument();
  });

  it("shows 'Add location' when no locationAddress", () => {
    render(<PlaceRowActionBar {...defaultProps} />);
    expect(screen.getByRole("button", { name: /add location/i })).toBeInTheDocument();
  });

  it("shows 'Add cost' when no cost", () => {
    render(<PlaceRowActionBar {...defaultProps} />);
    expect(screen.getByRole("button", { name: /add cost/i })).toBeInTheDocument();
  });

  it("shows Attach pill when no docs", () => {
    render(<PlaceRowActionBar {...defaultProps} />);
    expect(screen.getByTitle("Attach document")).toBeInTheDocument();
  });

  it("shows doc count button when hasDocs", () => {
    const place: TripEvent = {
      ...basePlace,
      docs: [{ id: "d1", name: "Plan.pdf", kind: "pdf", scope: "event", offline: false }],
    };
    render(<PlaceRowActionBar {...defaultProps} place={place} />);
    expect(screen.getByRole("button", { name: /doc/i })).toBeInTheDocument();
  });

  it("does not show Attach pill when hasDocs", () => {
    const place: TripEvent = {
      ...basePlace,
      docs: [{ id: "d1", name: "Plan.pdf", kind: "pdf", scope: "event", offline: false }],
    };
    render(<PlaceRowActionBar {...defaultProps} place={place} />);
    expect(screen.queryByTitle("Attach document")).not.toBeInTheDocument();
  });

  it("clicking Time pill calls onOpenTime", async () => {
    const user = userEvent.setup();
    const onOpenTime = vi.fn();
    render(<PlaceRowActionBar {...defaultProps} onOpenTime={onOpenTime} />);
    await user.click(screen.getByRole("button", { name: /add time/i }));
    expect(onOpenTime).toHaveBeenCalledOnce();
  });

  it("clicking Location pill calls onOpenLocation", async () => {
    const user = userEvent.setup();
    const onOpenLocation = vi.fn();
    render(<PlaceRowActionBar {...defaultProps} onOpenLocation={onOpenLocation} />);
    await user.click(screen.getByRole("button", { name: /add location/i }));
    expect(onOpenLocation).toHaveBeenCalledOnce();
  });

  it("clicking Cost pill calls onOpenCost", async () => {
    const user = userEvent.setup();
    const onOpenCost = vi.fn();
    render(<PlaceRowActionBar {...defaultProps} onOpenCost={onOpenCost} />);
    await user.click(screen.getByRole("button", { name: /add cost/i }));
    expect(onOpenCost).toHaveBeenCalledOnce();
  });

  it("clicking Attach pill calls onOpenAddDoc", async () => {
    const user = userEvent.setup();
    const onOpenAddDoc = vi.fn();
    render(<PlaceRowActionBar {...defaultProps} onOpenAddDoc={onOpenAddDoc} />);
    await user.click(screen.getByTitle("Attach document"));
    expect(onOpenAddDoc).toHaveBeenCalledOnce();
  });

  it("clicking Docs toggle pill calls onToggleDocs", async () => {
    const user = userEvent.setup();
    const onToggleDocs = vi.fn();
    const place: TripEvent = {
      ...basePlace,
      docs: [{ id: "d1", name: "Plan.pdf", kind: "pdf", scope: "event", offline: false }],
    };
    render(<PlaceRowActionBar {...defaultProps} place={place} onToggleDocs={onToggleDocs} />);
    await user.click(screen.getByRole("button", { name: /doc/i }));
    expect(onToggleDocs).toHaveBeenCalledOnce();
  });

  it("docs toggle has aria-expanded=false when showDocs is false", () => {
    const place: TripEvent = {
      ...basePlace,
      docs: [{ id: "d1", name: "Plan.pdf", kind: "pdf", scope: "event", offline: false }],
    };
    render(<PlaceRowActionBar {...defaultProps} place={place} showDocs={false} />);
    expect(screen.getByRole("button", { name: /doc/i })).toHaveAttribute("aria-expanded", "false");
  });

  it("docs toggle has aria-expanded=true when showDocs is true", () => {
    const place: TripEvent = {
      ...basePlace,
      docs: [{ id: "d1", name: "Plan.pdf", kind: "pdf", scope: "event", offline: false }],
    };
    render(<PlaceRowActionBar {...defaultProps} place={place} showDocs={true} />);
    expect(screen.getByRole("button", { name: /doc/i })).toHaveAttribute("aria-expanded", "true");
  });

  it("docs toggle has title 'Show attached documents'", () => {
    const place: TripEvent = {
      ...basePlace,
      docs: [{ id: "d1", name: "Plan.pdf", kind: "pdf", scope: "event", offline: false }],
    };
    render(<PlaceRowActionBar {...defaultProps} place={place} />);
    expect(screen.getByRole("button", { name: /doc/i })).toHaveAttribute("title", "Show attached documents");
  });

  it("cost displays formatted value with comma separators", () => {
    const place: TripEvent = { ...basePlace, cost: 1234567.89 };
    render(<PlaceRowActionBar {...defaultProps} place={place} />);
    expect(screen.getByText("1,234,567.89")).toBeInTheDocument();
  });
});
