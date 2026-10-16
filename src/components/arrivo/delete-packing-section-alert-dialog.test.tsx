import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DeletePackingSectionAlertDialog } from "./delete-packing-section-alert-dialog";

vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({
    children,
    open,
    onOpenChange,
  }: {
    children: ReactNode;
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) =>
    open ? (
      <div data-open="true">
        {children}
        <button onClick={() => onOpenChange(false)}>Dismiss</button>
      </div>
    ) : null,
  AlertDialogContent: (props: { children: ReactNode }) => <>{props.children}</>,
  AlertDialogHeader: (props: { children: ReactNode; className?: string }) => <>{props.children}</>,
  AlertDialogTitle: (props: { children: ReactNode }) => <h2>{props.children}</h2>,
  AlertDialogDescription: (props: { children: ReactNode; className?: string }) => <p>{props.children}</p>,
  AlertDialogFooter: (props: { children: ReactNode; className?: string }) => <>{props.children}</>,
  AlertDialogCancel: ({ children, disabled }: { children: ReactNode; disabled?: boolean }) => (
    <button disabled={disabled}>{children}</button>
  ),
  AlertDialogAction: ({
    children,
    disabled,
    onClick,
  }: {
    children: ReactNode;
    disabled?: boolean;
    onClick?: () => void;
  }) => (
    <button disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
}));

describe("DeletePackingSectionAlertDialog", () => {
  it("describes the move-or-delete choice for multiple items", () => {
    render(
      <DeletePackingSectionAlertDialog
        sectionName="Documents"
        itemCount={2}
        open
        onOpenChange={vi.fn()}
        onMoveItems={vi.fn()}
        onDeleteItems={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { name: "Delete Documents?" })).toBeInTheDocument();
    expect(screen.getByText(/This section has 2 items\. Move them to Ungrouped/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep Items" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete Items" })).toBeInTheDocument();
  });

  it("calls the move handler when the move action is chosen", async () => {
    const user = userEvent.setup();
    const onMoveItems = vi.fn();

    render(
      <DeletePackingSectionAlertDialog
        sectionName="Documents"
        itemCount={1}
        open
        onOpenChange={vi.fn()}
        onMoveItems={onMoveItems}
        onDeleteItems={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Keep Items" }));

    expect(onMoveItems).toHaveBeenCalledOnce();
  });

  it("calls the delete handler when the destructive action is chosen", async () => {
    const user = userEvent.setup();
    const onDeleteItems = vi.fn();

    render(
      <DeletePackingSectionAlertDialog
        sectionName="Documents"
        itemCount={1}
        open
        onOpenChange={vi.fn()}
        onMoveItems={vi.fn()}
        onDeleteItems={onDeleteItems}
      />
    );

    await user.click(screen.getByRole("button", { name: "Delete Items" }));

    expect(onDeleteItems).toHaveBeenCalledOnce();
  });

  it("disables every action while the request is pending", () => {
    render(
      <DeletePackingSectionAlertDialog
        sectionName="Documents"
        itemCount={1}
        open
        onOpenChange={vi.fn()}
        onMoveItems={vi.fn()}
        onDeleteItems={vi.fn()}
        isDeleting
      />
    );

    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Working..." })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Working..." })[0]).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Working..." })[1]).toBeDisabled();
  });
});
