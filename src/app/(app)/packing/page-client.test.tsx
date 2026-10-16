import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PackingTemplate } from "@/data/types";

const { mockCreateTemplate, mockDeleteTemplate, mockRenameTemplate } = vi.hoisted(() => ({
  mockCreateTemplate: vi.fn(),
  mockDeleteTemplate: vi.fn(),
  mockRenameTemplate: vi.fn(),
}));

vi.mock("./actions", () => ({
  createTemplate: mockCreateTemplate,
  deleteTemplate: mockDeleteTemplate,
  renameTemplate: mockRenameTemplate,
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

vi.mock("@/components/arrivo/template-library", () => ({
  TemplateLibrary: ({
    templates,
    onDelete,
    onNew,
    onRename,
  }: {
    templates: PackingTemplate[];
    onDelete: (template: PackingTemplate) => void;
    onNew: () => void;
    onRename: (template: PackingTemplate) => void;
  }) => (
    <div>
      <button onClick={onNew}>open-create</button>
      <button onClick={() => onRename(templates[0])}>open-rename</button>
      <button onClick={() => onDelete(templates[0])}>open-delete</button>
    </div>
  ),
}));

vi.mock("@/components/arrivo/template-form-dialog", () => ({
  TemplateFormDialog: ({
    mode,
    open,
    onOpenChange,
    onSubmit,
  }: {
    mode: "create" | "rename";
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (name: string) => void | Promise<void>;
  }) =>
    open ? (
      <div>
        <button onClick={() => void onSubmit(mode === "create" ? "Created Template" : "Renamed Template")}>
          submit-{mode}
        </button>
        <button onClick={() => onOpenChange(false)}>close-{mode}</button>
      </div>
    ) : null,
}));

vi.mock("@/components/arrivo/delete-template-alert-dialog", () => ({
  DeleteTemplateAlertDialog: ({
    open,
    onConfirm,
    onOpenChange,
  }: {
    open: boolean;
    onConfirm: () => void | Promise<void>;
    onOpenChange: (open: boolean) => void;
  }) =>
    open ? (
      <div>
        <button onClick={() => void onConfirm()}>confirm-delete</button>
        <button onClick={() => onOpenChange(false)}>close-delete</button>
      </div>
    ) : null,
}));

import { toast } from "sonner";
import { TemplatesPageClient } from "./page-client";

const templates: PackingTemplate[] = [{ id: "template-1", name: "Beach Weekend" }];

describe("TemplatesPageClient", () => {
  it("creates a template and closes the create dialog on success", async () => {
    const user = userEvent.setup();
    mockCreateTemplate.mockResolvedValueOnce({ id: "template-2" });

    render(<TemplatesPageClient templates={templates} />);

    await user.click(screen.getByRole("button", { name: "open-create" }));
    await user.click(screen.getByRole("button", { name: "submit-create" }));

    expect(mockCreateTemplate).toHaveBeenCalledWith({ name: "Created Template" });
    expect(screen.queryByRole("button", { name: "submit-create" })).not.toBeInTheDocument();
  });

  it("renames a template and clears rename state on success", async () => {
    const user = userEvent.setup();
    mockRenameTemplate.mockResolvedValueOnce(undefined);

    render(<TemplatesPageClient templates={templates} />);

    await user.click(screen.getByRole("button", { name: "open-rename" }));
    await user.click(screen.getByRole("button", { name: "submit-rename" }));

    expect(mockRenameTemplate).toHaveBeenCalledWith("template-1", { name: "Renamed Template" });
    expect(screen.queryByRole("button", { name: "submit-rename" })).not.toBeInTheDocument();
  });

  it("deletes a template and clears delete state on success", async () => {
    const user = userEvent.setup();
    mockDeleteTemplate.mockResolvedValueOnce(undefined);

    render(<TemplatesPageClient templates={templates} />);

    await user.click(screen.getByRole("button", { name: "open-delete" }));
    await user.click(screen.getByRole("button", { name: "confirm-delete" }));

    expect(mockDeleteTemplate).toHaveBeenCalledWith("template-1");
    expect(screen.queryByRole("button", { name: "confirm-delete" })).not.toBeInTheDocument();
  });

  it("reports action failures with a toast and keeps the dialog open", async () => {
    const user = userEvent.setup();
    mockRenameTemplate.mockRejectedValueOnce(new Error("Rename failed"));

    render(<TemplatesPageClient templates={templates} />);

    await user.click(screen.getByRole("button", { name: "open-rename" }));
    await user.click(screen.getByRole("button", { name: "submit-rename" }));

    expect(toast.error).toHaveBeenCalledWith("Rename failed");
    expect(screen.getByRole("button", { name: "submit-rename" })).toBeInTheDocument();
  });
});
