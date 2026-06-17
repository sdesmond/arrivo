import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReservationFieldDialog } from "./reservation-field-dialog";

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({
    children,
    open,
    onOpenChange,
  }: {
    children: React.ReactNode;
    open: boolean;
    onOpenChange?: (open: boolean) => void;
  }) =>
    open ? (
      <div>
        {children}
        <button onClick={() => onOpenChange?.(false)}>dismiss</button>
      </div>
    ) : null,
  DialogContent: (props: { children: React.ReactNode }) => <>{props.children}</>,
  DialogHeader: (props: { children: React.ReactNode }) => <>{props.children}</>,
  DialogTitle: (props: { children: React.ReactNode }) => <h2>{props.children}</h2>,
  DialogFooter: (props: { children: React.ReactNode }) => <div>{props.children}</div>,
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    variant?: string;
    className?: string;
  }) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

vi.mock("./location-lookup-input", () => ({
  LocationLookupInput: ({
    id,
    value,
    onValueChange,
    onResolved,
    onSubmit,
  }: {
    id?: string;
    value: string;
    onValueChange: (value: string) => void;
    onResolved: (location: {
      name: string;
      fullAddress: string;
      center: [number, number];
      placeName: string;
      country: string;
      countryCode: string;
    }) => void;
    onSubmit?: () => void;
  }) => (
    <div>
      <input
        id={id}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") onSubmit?.();
        }}
      />
      <button
        onClick={() => {
          onValueChange("1 World Way, Los Angeles, CA");
          onResolved({
            name: "LAX Airport",
            fullAddress: "1 World Way, Los Angeles, CA",
            center: [-118.4085, 33.9416],
            placeName: "LAX Airport",
            country: "United States",
            countryCode: "US",
          });
        }}
      >
        resolve-location
      </button>
    </div>
  ),
}));

describe("ReservationFieldDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render when closed", () => {
    render(<ReservationFieldDialog title="Departure address" open={false} onOpenChange={vi.fn()} onSave={vi.fn()} />);
    expect(screen.queryByRole("heading", { name: "Departure address" })).not.toBeInTheDocument();
  });

  it("renders the title when open", () => {
    render(<ReservationFieldDialog title="Departure address" open onOpenChange={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Departure address" })).toBeInTheDocument();
  });

  it("pre-fills the input with the current value", () => {
    render(
      <ReservationFieldDialog
        title="Departure address"
        value="JFK Airport"
        open
        onOpenChange={vi.fn()}
        onSave={vi.fn()}
      />
    );
    expect(screen.getByRole("textbox")).toHaveValue("JFK Airport");
  });

  it("syncs the draft when the dialog reopens with a new value", () => {
    const { rerender } = render(
      <ReservationFieldDialog
        title="Departure address"
        value="JFK"
        open={false}
        onOpenChange={vi.fn()}
        onSave={vi.fn()}
      />
    );
    rerender(
      <ReservationFieldDialog title="Departure address" value="LAX" open onOpenChange={vi.fn()} onSave={vi.fn()} />
    );
    expect(screen.getByRole("textbox")).toHaveValue("LAX");
  });

  it("calls onSave with the trimmed value and closes when Save is clicked", async () => {
    const onSave = vi.fn();
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ReservationFieldDialog
        title="Departure address"
        value="JFK Airport"
        open
        onOpenChange={onOpenChange}
        onSave={onSave}
      />
    );

    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "  LAX Airport  ");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith("LAX Airport");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("calls onSave with undefined when the input is cleared", async () => {
    const onSave = vi.fn();
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ReservationFieldDialog
        title="Departure address"
        value="JFK Airport"
        open
        onOpenChange={onOpenChange}
        onSave={onSave}
      />
    );

    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith(undefined);
  });

  it("saves on Enter key", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(
      <ReservationFieldDialog title="Departure address" value="JFK" open onOpenChange={vi.fn()} onSave={onSave} />
    );

    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "LAX{Enter}");

    expect(onSave).toHaveBeenCalledWith("LAX");
  });

  it("does not show Remove button when value is empty", () => {
    render(<ReservationFieldDialog title="Departure address" open onOpenChange={vi.fn()} onSave={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
  });

  it("shows Remove button when a value is set and calls onSave(undefined) when clicked", async () => {
    const onSave = vi.fn();
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ReservationFieldDialog
        title="Departure address"
        value="JFK Airport"
        open
        onOpenChange={onOpenChange}
        onSave={onSave}
      />
    );

    await user.click(screen.getByRole("button", { name: "Remove" }));

    expect(onSave).toHaveBeenCalledWith(undefined);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("closes without saving when Cancel is clicked", async () => {
    const onSave = vi.fn();
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ReservationFieldDialog
        title="Departure address"
        value="JFK Airport"
        open
        onOpenChange={onOpenChange}
        onSave={onSave}
      />
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onSave).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("calls onOpenChange(false) when the dialog is dismissed via backdrop", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ReservationFieldDialog
        title="Departure address"
        value="JFK Airport"
        open
        onOpenChange={onOpenChange}
        onSave={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "dismiss" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("applies inputStyle to the input element", () => {
    render(
      <ReservationFieldDialog
        title="Confirmation code"
        open
        onOpenChange={vi.fn()}
        onSave={vi.fn()}
        inputStyle={{ fontFamily: "monospace" }}
      />
    );
    expect(screen.getByRole("textbox")).toHaveStyle({ fontFamily: "monospace" });
  });

  it("saves a manual location address in location mode", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(
      <ReservationFieldDialog mode="location" title="Departure address" open onOpenChange={vi.fn()} onSave={onSave} />
    );

    await user.type(screen.getByRole("textbox"), "  LAX Airport  ");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith({ address: "LAX Airport" });
  });

  it("saves structured location data when a suggestion is selected", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(
      <ReservationFieldDialog mode="location" title="Departure address" open onOpenChange={vi.fn()} onSave={onSave} />
    );

    await user.click(screen.getByRole("button", { name: "resolve-location" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith({
      address: "1 World Way, Los Angeles, CA",
      name: "LAX Airport",
      lat: 33.9416,
      lng: -118.4085,
    });
  });
});
