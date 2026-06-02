import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({
    children,
    open,
    onOpenChange,
  }: {
    children: React.ReactNode;
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) =>
    open ? (
      <div>
        {children}
        <button onClick={() => onOpenChange(false)}>dismiss-dialog</button>
      </div>
    ) : null,
  AlertDialogContent: (props: { children: React.ReactNode }) => <>{props.children}</>,
  AlertDialogHeader: (props: { children: React.ReactNode }) => <>{props.children}</>,
  AlertDialogTitle: (props: { children: React.ReactNode }) => <>{props.children}</>,
  AlertDialogDescription: (props: { children: React.ReactNode }) => <>{props.children}</>,
  AlertDialogFooter: (props: { children: React.ReactNode }) => <>{props.children}</>,
  AlertDialogCancel: ({ children, disabled }: { children: React.ReactNode; disabled?: boolean }) => (
    <button disabled={disabled}>{children}</button>
  ),
  AlertDialogAction: ({
    children,
    disabled,
    onClick,
  }: {
    children: React.ReactNode;
    disabled?: boolean;
    onClick?: () => void;
  }) => (
    <button disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
}));

import { DeleteTemplateAlertDialog } from "./delete-template-alert-dialog";

describe("DeleteTemplateAlertDialog", () => {
  it("renders the template-specific title and destructive copy", () => {
    render(<DeleteTemplateAlertDialog templateName="Beach Weekend" open onOpenChange={vi.fn()} onConfirm={vi.fn()} />);

    expect(screen.getByText(/Delete\s+Beach Weekend\?/)).toBeInTheDocument();
    expect(screen.getByText(/permanently remove the template from your library/i)).toBeInTheDocument();
  });

  it("calls onConfirm when delete is pressed", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <DeleteTemplateAlertDialog templateName="Beach Weekend" open onOpenChange={vi.fn()} onConfirm={onConfirm} />
    );

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("propagates close requests through onOpenChange", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(
      <DeleteTemplateAlertDialog templateName="Beach Weekend" open onOpenChange={onOpenChange} onConfirm={vi.fn()} />
    );

    await user.click(screen.getByRole("button", { name: "dismiss-dialog" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows the deleting state and disables actions while pending", () => {
    render(
      <DeleteTemplateAlertDialog
        templateName="Beach Weekend"
        open
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        isDeleting
      />
    );

    expect(screen.getByRole("button", { name: "Deleting..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });
});
