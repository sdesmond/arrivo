import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { TripNotesDeleteDialog } from "./trip-notes-delete-dialog";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

describe("TripNotesDeleteDialog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("focuses Cancel when opened and calls confirm from its destructive action", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <TripNotesDeleteDialog
        open
        noteLabel="Pack sunscreen"
        isDeleting={false}
        error={null}
        onOpenChange={vi.fn()}
        onConfirm={onConfirm}
      />
    );

    const cancelButton = await screen.findByRole("button", { name: "Cancel" });
    expect(cancelButton).toHaveFocus();
    expect(screen.getByRole("heading", { name: "Delete Pack sunscreen?" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("marks its dialog busy and announces deletion while pending", () => {
    render(
      <TripNotesDeleteDialog
        open
        noteLabel="Pack sunscreen"
        isDeleting
        error={null}
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    expect(screen.getByRole("dialog")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Deleting note");
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
  });

  it("keeps a failure visible, focuses Retry, and lets it retry the mutation", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <TripNotesDeleteDialog
        open
        noteLabel="Pack sunscreen"
        isDeleting={false}
        error={null}
        onOpenChange={vi.fn()}
        onConfirm={onConfirm}
      />
    );

    rerender(
      <TripNotesDeleteDialog
        open
        noteLabel="Pack sunscreen"
        isDeleting={false}
        error="Couldn't delete note. Try again."
        onOpenChange={vi.fn()}
        onConfirm={onConfirm}
      />
    );

    const retryButton = await screen.findByRole("button", { name: "Retry" });
    await waitFor(() => expect(retryButton).toHaveFocus());
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't delete note. Try again.");
    expect(retryButton.style.minHeight).toBe("44px");
    expect(retryButton.style.minWidth).toBe("44px");
    expect(toast.error).toHaveBeenCalledWith("Couldn't delete note. Try again.");

    await user.click(retryButton);
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
