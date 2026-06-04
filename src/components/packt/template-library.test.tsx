import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TemplateLibrary } from "./template-library";
import type { PackingTemplate } from "@/data/types";

const templates: PackingTemplate[] = [
  { id: "template-1", name: "Beach Weekend" },
  { id: "template-2", name: "Carry-on Only" },
];

describe("TemplateLibrary", () => {
  it("renders the empty state and create action when there are no templates", async () => {
    const user = userEvent.setup();
    const onNew = vi.fn();

    render(<TemplateLibrary templates={[]} onNew={onNew} onRename={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByText("No templates yet")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create first template" }));
    expect(onNew).toHaveBeenCalledOnce();
  });

  it("renders each template with rename and delete affordances", () => {
    render(<TemplateLibrary templates={templates} onNew={vi.fn()} onRename={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByText("Beach Weekend")).toBeInTheDocument();
    expect(screen.getByText("Carry-on Only")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Beach Weekend" })).toHaveAttribute("href", "/packing/template-1");
    expect(screen.getByRole("link", { name: "Carry-on Only" })).toHaveAttribute("href", "/packing/template-2");
    expect(screen.getByRole("button", { name: "Rename Beach Weekend (template-1)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete Beach Weekend (template-1)" })).toBeInTheDocument();
  });

  it("calls onNew from the header button", async () => {
    const user = userEvent.setup();
    const onNew = vi.fn();

    render(<TemplateLibrary templates={templates} onNew={onNew} onRename={vi.fn()} onDelete={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "New template" }));
    expect(onNew).toHaveBeenCalledOnce();
  });

  it("passes the selected template to rename and delete handlers", async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    const onDelete = vi.fn();

    render(<TemplateLibrary templates={templates} onNew={vi.fn()} onRename={onRename} onDelete={onDelete} />);

    await user.click(screen.getByRole("button", { name: "Rename Carry-on Only (template-2)" }));
    await user.click(screen.getByRole("button", { name: "Delete Carry-on Only (template-2)" }));

    expect(onRename).toHaveBeenCalledWith(templates[1]);
    expect(onDelete).toHaveBeenCalledWith(templates[1]);
  });
});
