import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div role="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    onClick,
  }: {
    children: React.ReactNode;
    href: string;
    onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  }) => (
    <a href={href} onClick={onClick}>
      {children}
    </a>
  ),
}));

import { TemplatePullDialog } from "./template-pull-dialog";
import type { PackingTemplate } from "@/data/types";

const templates: PackingTemplate[] = [
  { id: "t1", name: "Beach Weekend" },
  { id: "t2", name: "Business Trip" },
];

describe("TemplatePullDialog", () => {
  it("renders template names with checkboxes when open", () => {
    render(<TemplatePullDialog open onOpenChange={vi.fn()} templates={templates} onPull={vi.fn()} />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Pull from templates")).toBeInTheDocument();
    expect(screen.getByLabelText("Beach Weekend")).toBeInTheDocument();
    expect(screen.getByLabelText("Business Trip")).toBeInTheDocument();
  });

  it("does not render when open=false", () => {
    render(<TemplatePullDialog open={false} onOpenChange={vi.fn()} templates={templates} onPull={vi.fn()} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows no-templates message with link when templates is empty", () => {
    render(<TemplatePullDialog open onOpenChange={vi.fn()} templates={[]} onPull={vi.fn()} />);

    expect(screen.getByText(/No templates yet/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /create one from the template library/i })).toHaveAttribute(
      "href",
      "/packing"
    );
  });

  it("Pull selected button is disabled when no templates are checked", () => {
    render(<TemplatePullDialog open onOpenChange={vi.fn()} templates={templates} onPull={vi.fn()} />);

    expect(screen.getByRole("button", { name: /Pull selected/ })).toBeDisabled();
  });

  it("enables Pull selected after checking a template and calls onPull with its id", async () => {
    const user = userEvent.setup();
    const onPull = vi.fn().mockResolvedValue({ added: 2, skipped: 0 });

    render(<TemplatePullDialog open onOpenChange={vi.fn()} templates={templates} onPull={onPull} />);

    await user.click(screen.getByLabelText("Beach Weekend"));
    const pullBtn = screen.getByRole("button", { name: /Pull selected/ });
    expect(pullBtn).not.toBeDisabled();

    await user.click(pullBtn);

    await waitFor(() => expect(onPull).toHaveBeenCalledWith(["t1"]));
  });

  it("calls onPull with all selected template ids", async () => {
    const user = userEvent.setup();
    const onPull = vi.fn().mockResolvedValue({ added: 3, skipped: 0 });

    render(<TemplatePullDialog open onOpenChange={vi.fn()} templates={templates} onPull={onPull} />);

    await user.click(screen.getByLabelText("Beach Weekend"));
    await user.click(screen.getByLabelText("Business Trip"));
    await user.click(screen.getByRole("button", { name: /Pull selected/ }));

    await waitFor(() => {
      const [ids] = onPull.mock.calls[0] as [string[]];
      expect(ids.sort()).toEqual(["t1", "t2"]);
    });
  });

  it("closes when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(<TemplatePullDialog open onOpenChange={onOpenChange} templates={templates} onPull={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("does not show Pull selected button when templates list is empty", () => {
    render(<TemplatePullDialog open onOpenChange={vi.fn()} templates={[]} onPull={vi.fn()} />);

    expect(screen.queryByRole("button", { name: /Pull selected/ })).not.toBeInTheDocument();
  });

  it("unchecking a checked template re-disables the Pull selected button", async () => {
    const user = userEvent.setup();

    render(<TemplatePullDialog open onOpenChange={vi.fn()} templates={templates} onPull={vi.fn()} />);

    await user.click(screen.getByLabelText("Beach Weekend"));
    expect(screen.getByRole("button", { name: /Pull selected/ })).not.toBeDisabled();

    await user.click(screen.getByLabelText("Beach Weekend"));
    expect(screen.getByRole("button", { name: /Pull selected/ })).toBeDisabled();
  });

  it("clicking the template library link calls onOpenChange(false)", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(<TemplatePullDialog open onOpenChange={onOpenChange} templates={[]} onPull={vi.fn()} />);

    await user.click(screen.getByRole("link", { name: /create one from the template library/i }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
