import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LeaveTripAlertDialog } from "./leave-trip-alert-dialog";

interface HarnessProps {
  onConfirm?: () => void;
  isLeaving?: boolean;
}

function Harness({ onConfirm = vi.fn(), isLeaving = false }: HarnessProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open leave
      </button>
      <LeaveTripAlertDialog
        tripName="Tokyo Adventure"
        open={open}
        onOpenChange={setOpen}
        onConfirm={onConfirm}
        isLeaving={isLeaving}
      />
    </>
  );
}

describe("LeaveTripAlertDialog", () => {
  it("names the trip and explains that leaving removes access and drops it from the list", async () => {
    render(<LeaveTripAlertDialog tripName="Tokyo Adventure" open onOpenChange={vi.fn()} onConfirm={vi.fn()} />);

    const dialog = await screen.findByRole("alertdialog");
    expect(screen.getByRole("heading", { name: "Leave Tokyo Adventure?" })).toBeInTheDocument();
    expect(dialog).toHaveTextContent(/lose access to this trip/i);
    expect(dialog).toHaveTextContent(/disappear from your trips list/i);
    expect(dialog).not.toHaveTextContent(/removed you/i);
    expect(dialog).not.toHaveTextContent(/delete/i);
  });

  it("confirms through a destructive Leave trip action", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<LeaveTripAlertDialog tripName="Tokyo Adventure" open onOpenChange={vi.fn()} onConfirm={onConfirm} />);

    const confirmButton = await screen.findByRole("button", { name: "Leave trip" });
    expect(confirmButton).toHaveClass("text-destructive");

    await user.click(confirmButton);

    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("moves focus inside on open and returns it to the trigger on Cancel", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);

    const trigger = screen.getByRole("button", { name: "Open leave" });
    await user.click(trigger);

    const dialog = await screen.findByRole("alertdialog");
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("closes on Escape without confirming and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);

    const trigger = screen.getByRole("button", { name: "Open leave" });
    await user.click(trigger);
    await screen.findByRole("alertdialog");

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("shows the pending state, disables both actions, and ignores close requests while leaving", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <LeaveTripAlertDialog tripName="Tokyo Adventure" open onOpenChange={onOpenChange} onConfirm={vi.fn()} isLeaving />
    );

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Leaving..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

    await user.keyboard("{Escape}");

    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("keeps a failure visible inside the dialog", async () => {
    render(
      <LeaveTripAlertDialog
        tripName="Tokyo Adventure"
        open
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        error="Couldn't leave this trip. Try again."
      />
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't leave this trip. Try again.");
    expect(screen.getByRole("button", { name: "Leave trip" })).toBeEnabled();
  });

  it("sizes both actions to at least 44px tall", async () => {
    render(<LeaveTripAlertDialog tripName="Tokyo Adventure" open onOpenChange={vi.fn()} onConfirm={vi.fn()} />);

    for (const name of ["Cancel", "Leave trip"]) {
      const button = await screen.findByRole("button", { name });
      expect(button.style.minHeight).toBe("44px");
      expect(button.style.minWidth).toBe("44px");
    }
  });
});
