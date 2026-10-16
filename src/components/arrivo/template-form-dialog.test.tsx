import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div role="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { TemplateFormDialog } from "./template-form-dialog";

describe("TemplateFormDialog", () => {
  it("renders create copy and disables submit for whitespace-only input", async () => {
    const user = userEvent.setup();

    render(<TemplateFormDialog mode="create" open onOpenChange={vi.fn()} onSubmit={vi.fn()} />);

    expect(screen.getByText("New template")).toBeInTheDocument();
    const submit = screen.getByRole("button", { name: "Create template" });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText("Template name"), "   ");
    expect(submit).toBeDisabled();
  });

  it("renders rename copy and seeds the initial name", () => {
    render(
      <TemplateFormDialog mode="rename" initialName="Carry-on Only" open onOpenChange={vi.fn()} onSubmit={vi.fn()} />
    );

    expect(screen.getByText("Rename template")).toBeInTheDocument();
    expect(screen.getByLabelText("Template name")).toHaveValue("Carry-on Only");
  });

  it("submits a trimmed name", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<TemplateFormDialog mode="create" open onOpenChange={vi.fn()} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Template name"), "  Weekend Kit  ");
    await user.click(screen.getByRole("button", { name: "Create template" }));

    expect(onSubmit).toHaveBeenCalledWith("Weekend Kit");
  });

  it("supports enter-to-submit and exposes the maxLength guard", async () => {
    const onSubmit = vi.fn();

    render(<TemplateFormDialog mode="create" open onOpenChange={vi.fn()} onSubmit={onSubmit} />);

    const input = screen.getByLabelText("Template name");
    expect(input).toHaveAttribute("maxLength", "30");

    fireEvent.change(input, { target: { value: "Road Trip" } });
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);

    expect(onSubmit).toHaveBeenCalledWith("Road Trip");
  });

  it("resets the input when reopened with a new initial name", () => {
    const view = render(
      <TemplateFormDialog mode="rename" initialName="Beach Weekend" open onOpenChange={vi.fn()} onSubmit={vi.fn()} />
    );

    fireEvent.change(screen.getByLabelText("Template name"), { target: { value: "Changed" } });

    view.unmount();

    render(
      <TemplateFormDialog mode="rename" initialName="Carry-on Only" open onOpenChange={vi.fn()} onSubmit={vi.fn()} />
    );

    expect(screen.getByLabelText("Template name")).toHaveValue("Carry-on Only");
  });

  it("calls onOpenChange(false) when cancel is clicked", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(<TemplateFormDialog mode="create" open onOpenChange={onOpenChange} onSubmit={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
