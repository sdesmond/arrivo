// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("lucide-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("lucide-react")>();
  return {
    ...actual,
    MapPin: ({ strokeWidth, ...props }: React.SVGProps<SVGSVGElement> & { strokeWidth?: number }) => (
      <svg data-testid="map-pin-icon" data-stroke-width={strokeWidth} {...props} />
    ),
    FileText: ({ strokeWidth, ...props }: React.SVGProps<SVGSVGElement> & { strokeWidth?: number }) => (
      <svg data-testid="file-text-icon" data-stroke-width={strokeWidth} {...props} />
    ),
    ListChecks: ({ strokeWidth, ...props }: React.SVGProps<SVGSVGElement> & { strokeWidth?: number }) => (
      <svg data-testid="list-checks-icon" data-stroke-width={strokeWidth} {...props} />
    ),
  };
});

import { TypePicker } from "./type-picker";
import { ItineraryItemType } from "@/data/types";

describe("TypePicker", () => {
  it("renders MapPin icon with strokeWidth 1.5", () => {
    render(<TypePicker onSelect={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByTestId("map-pin-icon")).toHaveAttribute("data-stroke-width", "1.5");
  });

  it("renders FileText icon with strokeWidth 1.5", () => {
    render(<TypePicker onSelect={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByTestId("file-text-icon")).toHaveAttribute("data-stroke-width", "1.5");
  });

  it("MapPin button has title 'Add event'", () => {
    render(<TypePicker onSelect={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByTitle("Add event")).toBeInTheDocument();
  });

  it("FileText button has title 'Add note'", () => {
    render(<TypePicker onSelect={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByTitle("Add note")).toBeInTheDocument();
  });

  it("clicking MapPin button calls onSelect with Event type", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<TypePicker onSelect={onSelect} onDismiss={vi.fn()} />);
    await user.click(screen.getByTitle("Add event"));
    expect(onSelect).toHaveBeenCalledWith(ItineraryItemType.Event);
  });

  it("clicking FileText button calls onSelect with Note type", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<TypePicker onSelect={onSelect} onDismiss={vi.fn()} />);
    await user.click(screen.getByTitle("Add note"));
    expect(onSelect).toHaveBeenCalledWith(ItineraryItemType.Note);
  });

  it("pressing Escape calls onDismiss", () => {
    const onDismiss = vi.fn();
    render(<TypePicker onSelect={vi.fn()} onDismiss={onDismiss} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalled();
  });

  it("clicking outside the picker calls onDismiss", () => {
    const onDismiss = vi.fn();
    render(<TypePicker onSelect={vi.fn()} onDismiss={onDismiss} />);
    fireEvent.mouseDown(document.body);
    expect(onDismiss).toHaveBeenCalled();
  });

  it("clicking inside the picker does not call onDismiss", async () => {
    const onDismiss = vi.fn();
    render(<TypePicker onSelect={vi.fn()} onDismiss={onDismiss} />);
    fireEvent.mouseDown(screen.getByTitle("Add event"));
    expect(onDismiss).not.toHaveBeenCalled();
  });
});

describe("TypePicker — ListChecks (checklist)", () => {
  it("renders ListChecks icon with strokeWidth 1.5", () => {
    render(<TypePicker onSelect={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByTestId("list-checks-icon")).toHaveAttribute("data-stroke-width", "1.5");
  });

  it("ListChecks button has title 'Add checklist'", () => {
    render(<TypePicker onSelect={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByTitle("Add checklist")).toBeInTheDocument();
  });

  it("clicking ListChecks button calls onSelect with Checklist type", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<TypePicker onSelect={onSelect} onDismiss={vi.fn()} />);
    await user.click(screen.getByTitle("Add checklist"));
    expect(onSelect).toHaveBeenCalledWith(ItineraryItemType.Checklist);
  });
});
