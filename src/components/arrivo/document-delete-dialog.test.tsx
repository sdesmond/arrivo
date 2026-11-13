import { useRef, useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { DocumentDeleteDialog } from "./document-delete-dialog";

it("labels deletion and dispatches cancel and confirmation", async () => {
  const onOpenChange = vi.fn();
  const onConfirm = vi.fn();
  render(
    <DocumentDeleteDialog
      name="Pass.pdf"
      open
      isPending={false}
      error="Try again"
      onOpenChange={onOpenChange}
      onConfirm={onConfirm}
    />
  );
  expect(screen.getByRole("dialog")).toHaveAccessibleName("Delete Pass.pdf?");
  expect(screen.getByRole("dialog")).toHaveAccessibleDescription("This cannot be undone.");
  expect(screen.getByRole("alert")).toHaveTextContent("Try again");
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  expect(onConfirm).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

it("disables both controls while pending", () => {
  render(
    <DocumentDeleteDialog name="Pass.pdf" open isPending error={null} onOpenChange={vi.fn()} onConfirm={vi.fn()} />
  );
  expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("opens by keyboard, focuses cancel, dismisses with Escape and restores focus", async () => {
  function Harness() {
    const [open, setOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);
    return (
      <>
        <button ref={triggerRef} onClick={() => setOpen(true)}>
          Remove document
        </button>
        <DocumentDeleteDialog
          name="Pass.pdf"
          open={open}
          isPending={false}
          error={null}
          onOpenChange={setOpen}
          onConfirm={vi.fn()}
          finalFocusRef={triggerRef}
        />
      </>
    );
  }
  const user = userEvent.setup();
  render(<Harness />);
  await user.tab();
  await user.keyboard("{Enter}");
  await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus());
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.getByRole("button", { name: "Remove document" })).toHaveFocus();
});
