// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/components/ui/date-picker", () => ({
  DatePicker: ({
    value,
    onChange,
    placeholder = "Pick a date",
  }: {
    value?: string;
    onChange: (v: string | undefined) => void;
    placeholder?: string;
  }) => (
    <input
      type="text"
      value={value ?? ""}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value || undefined)}
    />
  ),
}));

vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    width,
    height,
    style,
  }: {
    src: string;
    alt: string;
    width?: number;
    height?: number;
    style?: React.CSSProperties;
  }) => <img src={src} alt={alt} width={width} height={height} style={style} />,
}));

vi.mock("./trip-edit-collaborators", () => ({
  TripEditCollaborators: ({
    onRemove,
    onUpdateRole,
    onAdd,
  }: {
    collaborators: unknown[];
    onRemove: (i: number) => void;
    onUpdateRole: (i: number, role: string) => void;
    onAdd: (name: string, email: string, role: string) => void;
  }) => (
    <div>
      <button onClick={() => onRemove(0)}>remove-collaborator</button>
      <button onClick={() => onUpdateRole(0, "viewer")}>update-role</button>
      <button onClick={() => onAdd("Test User", "test@test.com", "editor")}>add-collaborator</button>
    </div>
  ),
}));

vi.mock("@/components/ui/sheet", () => ({
  Sheet: (props: { children: React.ReactNode; open: boolean; onOpenChange?: (o: boolean) => void }) =>
    props.open ? (
      <>
        {props.children}
        <button data-testid="sheet-close-trigger" onClick={() => props.onOpenChange?.(false)} />
        <button data-testid="sheet-open-trigger" onClick={() => props.onOpenChange?.(true)} />
      </>
    ) : null,
  SheetContent: (props: { children: React.ReactNode }) => <>{props.children}</>,
  SheetHeader: (props: { children: React.ReactNode }) => <>{props.children}</>,
  SheetFooter: (props: { children: React.ReactNode }) => <>{props.children}</>,
  SheetTitle: (props: { children: React.ReactNode }) => <>{props.children}</>,
}));

import { TripEditSheet } from "./trip-edit-sheet";
import type { Trip, UpdateTripPatch } from "@/data/types";

const baseTrip: Trip = {
  id: "trip-1",
  name: "Tokyo Adventure",
  status: "upcoming",
  startDate: "2026-06-01",
  endDate: "2026-06-10",
  budget: {
    currency: "USD",
    total: 3000,
    perPerson: 1500,
  },
};

describe("TripEditSheet", () => {
  it("renders pre-filled trip name", () => {
    render(<TripEditSheet trip={baseTrip} open onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByDisplayValue("Tokyo Adventure")).toBeInTheDocument();
  });

  it("renders pre-filled start and end dates", () => {
    render(<TripEditSheet trip={baseTrip} open onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByDisplayValue("2026-06-01")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2026-06-10")).toBeInTheDocument();
  });

  it("renders budget total and per-person inputs with pre-filled values", () => {
    render(<TripEditSheet trip={baseTrip} open onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByDisplayValue("3000")).toBeInTheDocument();
    expect(screen.getByDisplayValue("1500")).toBeInTheDocument();
  });

  it("budget section label text is visible", () => {
    render(<TripEditSheet trip={baseTrip} open onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getByText("Per person")).toBeInTheDocument();
  });

  it("Cancel button calls onClose", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<TripEditSheet trip={baseTrip} open onClose={onClose} onSave={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("Save button calls onSave with current draft values", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<TripEditSheet trip={baseTrip} open onClose={vi.fn()} onSave={onSave} />);
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(onSave).toHaveBeenCalledOnce();
    const patch: UpdateTripPatch = onSave.mock.calls[0][0];
    expect(patch.name).toBe("Tokyo Adventure");
    expect(patch.startDate).toBe("2026-06-01");
    expect(patch.endDate).toBe("2026-06-10");
    expect(patch.budgetTotal).toBe(3000);
    expect(patch.budgetPerPerson).toBe(1500);
  });

  it("onSave includes modified name after editing", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<TripEditSheet trip={baseTrip} open onClose={vi.fn()} onSave={onSave} />);
    const nameInput = screen.getByDisplayValue("Tokyo Adventure");
    await user.clear(nameInput);
    await user.type(nameInput, "Kyoto Journey");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: "Kyoto Journey" }));
  });

  it("renders nothing when trip is null", () => {
    const { container } = render(<TripEditSheet trip={null} open onClose={vi.fn()} onSave={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("onSave includes updated start date", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<TripEditSheet trip={baseTrip} open onClose={vi.fn()} onSave={onSave} />);
    const startInput = screen.getByDisplayValue("2026-06-01");
    await user.clear(startInput);
    await user.type(startInput, "2026-07-01");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ startDate: "2026-07-01" }));
  });

  it("renders cover image URL input", () => {
    render(<TripEditSheet trip={baseTrip} open onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByPlaceholderText("https://…")).toBeInTheDocument();
  });

  it("renders cover image preview when coverImageUrl is set", () => {
    const trip = { ...baseTrip, coverImageUrl: "https://example.com/cover.jpg" };
    render(<TripEditSheet trip={trip} open onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByRole("img", { name: "Tokyo Adventure" })).toBeInTheDocument();
  });

  it("does not render a status select", () => {
    render(<TripEditSheet trip={baseTrip} open onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("updates budget currency input", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<TripEditSheet trip={baseTrip} open onClose={vi.fn()} onSave={onSave} />);
    const currencyInput = screen.getByDisplayValue("USD");
    await user.clear(currencyInput);
    await user.type(currencyInput, "EUR");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ budgetCurrency: "EUR" }));
  });

  it("sets budgetTotal to undefined when input is cleared", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<TripEditSheet trip={baseTrip} open onClose={vi.fn()} onSave={onSave} />);
    await user.clear(screen.getByDisplayValue("3000"));
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ budgetTotal: undefined }));
  });

  it("sets budgetPerPerson to undefined when input is cleared", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<TripEditSheet trip={baseTrip} open onClose={vi.fn()} onSave={onSave} />);
    await user.clear(screen.getByDisplayValue("1500"));
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ budgetPerPerson: undefined }));
  });

  it("sets coverImageUrl to undefined when input is cleared", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const trip = { ...baseTrip, coverImageUrl: "https://example.com/img.jpg" };
    render(<TripEditSheet trip={trip} open onClose={vi.fn()} onSave={onSave} />);
    await user.clear(screen.getByPlaceholderText("https://…"));
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ coverImageUrl: undefined }));
  });

  it("addCollaborator via TripEditCollaborators callback does not crash", async () => {
    const user = userEvent.setup();
    render(<TripEditSheet trip={baseTrip} open onClose={vi.fn()} onSave={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /add-collaborator/i }));
    expect(screen.getByRole("button", { name: /save changes/i })).toBeInTheDocument();
  });

  it("removeCollaborator via TripEditCollaborators callback does not crash", async () => {
    const user = userEvent.setup();
    const trip = {
      ...baseTrip,
      collaborators: [{ name: "Alice", email: "a@a.com", initials: "A", role: "editor" as const }],
    };
    render(<TripEditSheet trip={trip} open onClose={vi.fn()} onSave={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /remove-collaborator/i }));
    expect(screen.getByRole("button", { name: /save changes/i })).toBeInTheDocument();
  });

  it("updateCollaboratorRole with collaborators does not crash", async () => {
    const user = userEvent.setup();
    const trip = {
      ...baseTrip,
      collaborators: [{ name: "Alice", email: "a@a.com", initials: "A", role: "editor" as const }],
    };
    render(<TripEditSheet trip={trip} open onClose={vi.fn()} onSave={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /update-role/i }));
    expect(screen.getByRole("button", { name: /save changes/i })).toBeInTheDocument();
  });

  it("updateCollaboratorRole with no collaborators returns early without crash", async () => {
    const user = userEvent.setup();
    render(<TripEditSheet trip={baseTrip} open onClose={vi.fn()} onSave={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /update-role/i }));
    expect(screen.getByRole("button", { name: /save changes/i })).toBeInTheDocument();
  });

  it("onSave includes updated end date after editing", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<TripEditSheet trip={baseTrip} open onClose={vi.fn()} onSave={onSave} />);
    const endInput = screen.getByDisplayValue("2026-06-10");
    await user.clear(endInput);
    await user.type(endInput, "2026-07-10");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ endDate: "2026-07-10" }));
  });

  it("Sheet onOpenChange(false) calls onClose", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<TripEditSheet trip={baseTrip} open onClose={onClose} onSave={vi.fn()} />);
    await user.click(screen.getByTestId("sheet-close-trigger"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("Sheet onOpenChange(true) does not call onClose", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<TripEditSheet trip={baseTrip} open onClose={onClose} onSave={vi.fn()} />);
    await user.click(screen.getByTestId("sheet-open-trigger"));
    expect(onClose).not.toHaveBeenCalled();
  });
});
