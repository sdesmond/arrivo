import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TemplateEditorView } from "./template-editor-view";
import { RemovePackingSectionMode, type PackingTemplate, type PackingTemplateItem } from "@/data/types";

vi.mock("./packing-list-sortable", () => ({
  PackingListSortable: ({
    collapsedLabels,
    items,
    onToggleCollapse,
    onRemoveItem,
  }: {
    collapsedLabels?: Set<string>;
    items: Array<{ id?: string; name: string }>;
    onToggleCollapse?: (labelId: string) => void;
    onRemoveItem: (item: { id?: string; name: string }) => void;
  }) => (
    <div>
      <div>collapsed:{Array.from(collapsedLabels ?? []).join(",")}</div>
      <button onClick={() => onToggleCollapse?.("label-1")}>toggle-label-1</button>
      {items.map((item) => (
        <div key={item.id}>
          <span>{item.name}</span>
          <button onClick={() => onRemoveItem(item)}>remove-{item.name}</button>
        </div>
      ))}
    </div>
  ),
}));

const template: PackingTemplate = {
  id: "template-1",
  name: "Beach Weekend",
};

const items: PackingTemplateItem[] = [
  {
    id: "item-1",
    templateId: "template-1",
    text: "Sunscreen",
    isLabel: false,
    position: 0,
    labelId: null,
  },
];

const sectionedItems: PackingTemplateItem[] = [
  {
    id: "label-1",
    templateId: "template-1",
    text: "Beach Gear",
    isLabel: true,
    position: 0,
    labelId: null,
  },
  {
    id: "item-2",
    templateId: "template-1",
    text: "Sunscreen",
    isLabel: false,
    position: 1,
    labelId: "label-1",
  },
];

const labelOnlyItems: PackingTemplateItem[] = [
  {
    id: "label-2",
    templateId: "template-1",
    text: "Loose Ends",
    isLabel: true,
    position: 0,
    labelId: null,
  },
];

describe("TemplateEditorView", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders heading, back link, and New section form regardless of item count", () => {
    render(
      <TemplateEditorView
        template={template}
        items={[]}
        onAddItem={vi.fn()}
        onRemoveItem={vi.fn()}
        onEditItem={vi.fn()}
        onReorderItems={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { name: "Beach Weekend" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All Templates" })).toHaveAttribute("href", "/packing");
    expect(screen.queryByRole("heading", { name: "This template is empty" })).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("New section…")).toBeInTheDocument();
  });

  it("does not submit a blank section name", async () => {
    const user = userEvent.setup();
    const onAddItem = vi.fn();

    render(
      <TemplateEditorView
        template={template}
        items={[]}
        onAddItem={onAddItem}
        onRemoveItem={vi.fn()}
        onEditItem={vi.fn()}
        onReorderItems={vi.fn()}
      />
    );

    await user.type(screen.getByPlaceholderText("New section…"), "   ");
    await user.keyboard("{Enter}");

    expect(onAddItem).not.toHaveBeenCalled();
  });

  it("submits a trimmed section name as a label via New section form", async () => {
    const user = userEvent.setup();
    const onAddItem = vi.fn();

    render(
      <TemplateEditorView
        template={template}
        items={[]}
        onAddItem={onAddItem}
        onRemoveItem={vi.fn()}
        onEditItem={vi.fn()}
        onReorderItems={vi.fn()}
      />
    );

    await user.type(screen.getByPlaceholderText("New section…"), "  Beach Gear  ");
    await user.keyboard("{Enter}");

    expect(onAddItem).toHaveBeenCalledWith("Beach Gear", true, undefined, undefined, undefined);
  });

  it("renders existing items and forwards remove actions", async () => {
    const user = userEvent.setup();
    const onRemoveItem = vi.fn();

    render(
      <TemplateEditorView
        template={template}
        items={items}
        onAddItem={vi.fn()}
        onRemoveItem={onRemoveItem}
        onEditItem={vi.fn()}
        onReorderItems={vi.fn()}
      />
    );

    expect(screen.getByText("Sunscreen")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "remove-Sunscreen" }));

    expect(onRemoveItem).toHaveBeenCalledWith("item-1");
  });

  it("asks for confirmation before removing a label that still has items", async () => {
    const user = userEvent.setup();
    const onRemoveSection = vi.fn().mockResolvedValue(undefined);

    render(
      <TemplateEditorView
        template={template}
        items={sectionedItems}
        onAddItem={vi.fn()}
        onRemoveItem={vi.fn()}
        onRemoveSection={onRemoveSection}
        onEditItem={vi.fn()}
        onReorderItems={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "remove-Beach Gear" }));
    expect(screen.getByText("Delete Beach Gear?")).toBeInTheDocument();
    expect(screen.getByText(/Move it to Ungrouped/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Keep Items" }));

    expect(onRemoveSection).toHaveBeenCalledWith("label-1", {
      mode: RemovePackingSectionMode.MoveItemsToUngrouped,
    });
  });

  it("can delete a label and its items from the confirmation dialog", async () => {
    const user = userEvent.setup();
    const onRemoveSection = vi.fn().mockResolvedValue(undefined);

    render(
      <TemplateEditorView
        template={template}
        items={sectionedItems}
        onAddItem={vi.fn()}
        onRemoveItem={vi.fn()}
        onRemoveSection={onRemoveSection}
        onEditItem={vi.fn()}
        onReorderItems={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "remove-Beach Gear" }));
    await user.click(screen.getByRole("button", { name: "Delete Items" }));

    expect(onRemoveSection).toHaveBeenCalledWith("label-1", {
      mode: RemovePackingSectionMode.DeleteItems,
    });
  });

  it("removes an empty label without opening the confirmation dialog", async () => {
    const user = userEvent.setup();
    const onRemoveItem = vi.fn();

    render(
      <TemplateEditorView
        template={template}
        items={labelOnlyItems}
        onAddItem={vi.fn()}
        onRemoveItem={onRemoveItem}
        onRemoveSection={vi.fn()}
        onEditItem={vi.fn()}
        onReorderItems={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "remove-Loose Ends" }));

    expect(onRemoveItem).toHaveBeenCalledWith("label-2");
    expect(screen.queryByText("Delete Loose Ends?")).not.toBeInTheDocument();
  });

  it("closes the confirmation dialog when canceled", async () => {
    const user = userEvent.setup();

    render(
      <TemplateEditorView
        template={template}
        items={sectionedItems}
        onAddItem={vi.fn()}
        onRemoveItem={vi.fn()}
        onRemoveSection={vi.fn()}
        onEditItem={vi.fn()}
        onReorderItems={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "remove-Beach Gear" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByText("Delete Beach Gear?")).not.toBeInTheDocument();
  });

  it("keeps the confirmation dialog open when removing the section fails", async () => {
    const user = userEvent.setup();
    const onRemoveSection = vi.fn().mockRejectedValue(new Error("Failed"));

    render(
      <TemplateEditorView
        template={template}
        items={sectionedItems}
        onAddItem={vi.fn()}
        onRemoveItem={vi.fn()}
        onRemoveSection={onRemoveSection}
        onEditItem={vi.fn()}
        onReorderItems={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "remove-Beach Gear" }));
    await user.click(screen.getByRole("button", { name: "Keep Items" }));

    expect(onRemoveSection).toHaveBeenCalledWith("label-1", {
      mode: RemovePackingSectionMode.MoveItemsToUngrouped,
    });
    expect(screen.getByText("Delete Beach Gear?")).toBeInTheDocument();
  });

  it("hydrates and persists collapsed label ids for the template", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("packing_collapsed_template_template-1", JSON.stringify(["label-1"]));

    render(
      <TemplateEditorView
        template={template}
        items={sectionedItems}
        onAddItem={vi.fn()}
        onRemoveItem={vi.fn()}
        onEditItem={vi.fn()}
        onReorderItems={vi.fn()}
      />
    );

    expect(screen.getByText("collapsed:label-1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "toggle-label-1" }));
    expect(screen.getByText("collapsed:")).toBeInTheDocument();
    expect(window.localStorage.getItem("packing_collapsed_template_template-1")).toBe("[]");

    await user.click(screen.getByRole("button", { name: "toggle-label-1" }));
    expect(screen.getByText("collapsed:label-1")).toBeInTheDocument();
    expect(window.localStorage.getItem("packing_collapsed_template_template-1")).toBe('["label-1"]');
  });

  describe("inline title editing", () => {
    it("does not show a pointer cursor when onRenameTemplate is not provided", () => {
      render(
        <TemplateEditorView
          template={template}
          items={[]}
          onAddItem={vi.fn()}
          onRemoveItem={vi.fn()}
          onEditItem={vi.fn()}
          onReorderItems={vi.fn()}
        />
      );

      expect(screen.getByRole("heading", { name: "Beach Weekend" })).toBeInTheDocument();
    });

    it("clicking the title switches to an input field", async () => {
      const user = userEvent.setup();

      render(
        <TemplateEditorView
          template={template}
          items={[]}
          onAddItem={vi.fn()}
          onRemoveItem={vi.fn()}
          onEditItem={vi.fn()}
          onRenameTemplate={vi.fn()}
          onReorderItems={vi.fn()}
        />
      );

      await user.click(screen.getByRole("heading", { name: "Beach Weekend" }));
      const input = screen.getByDisplayValue("Beach Weekend");
      expect(input).toBeInTheDocument();
    });

    it("pressing Enter calls onRenameTemplate with the trimmed name", async () => {
      const user = userEvent.setup();
      const onRenameTemplate = vi.fn();

      render(
        <TemplateEditorView
          template={template}
          items={[]}
          onAddItem={vi.fn()}
          onRemoveItem={vi.fn()}
          onEditItem={vi.fn()}
          onRenameTemplate={onRenameTemplate}
          onReorderItems={vi.fn()}
        />
      );

      await user.click(screen.getByRole("heading", { name: "Beach Weekend" }));
      const input = screen.getByDisplayValue("Beach Weekend");
      await user.clear(input);
      await user.type(input, "Camping Trip{Enter}");

      expect(onRenameTemplate).toHaveBeenCalledWith("Camping Trip");
    });

    it("pressing Escape cancels without calling onRenameTemplate", async () => {
      const user = userEvent.setup();
      const onRenameTemplate = vi.fn();

      render(
        <TemplateEditorView
          template={template}
          items={[]}
          onAddItem={vi.fn()}
          onRemoveItem={vi.fn()}
          onEditItem={vi.fn()}
          onRenameTemplate={onRenameTemplate}
          onReorderItems={vi.fn()}
        />
      );

      await user.click(screen.getByRole("heading", { name: "Beach Weekend" }));
      const input = screen.getByDisplayValue("Beach Weekend");
      await user.clear(input);
      await user.type(input, "Camping Trip");
      await user.keyboard("{Escape}");

      expect(onRenameTemplate).not.toHaveBeenCalled();
      expect(screen.getByRole("heading", { name: "Beach Weekend" })).toBeInTheDocument();
    });

    it("does not call onRenameTemplate when the name is unchanged", async () => {
      const user = userEvent.setup();
      const onRenameTemplate = vi.fn();

      render(
        <TemplateEditorView
          template={template}
          items={[]}
          onAddItem={vi.fn()}
          onRemoveItem={vi.fn()}
          onEditItem={vi.fn()}
          onRenameTemplate={onRenameTemplate}
          onReorderItems={vi.fn()}
        />
      );

      await user.click(screen.getByRole("heading", { name: "Beach Weekend" }));
      await user.keyboard("{Enter}");

      expect(onRenameTemplate).not.toHaveBeenCalled();
    });

    it("does not call onRenameTemplate when the name is blank", async () => {
      const user = userEvent.setup();
      const onRenameTemplate = vi.fn();

      render(
        <TemplateEditorView
          template={template}
          items={[]}
          onAddItem={vi.fn()}
          onRemoveItem={vi.fn()}
          onEditItem={vi.fn()}
          onRenameTemplate={onRenameTemplate}
          onReorderItems={vi.fn()}
        />
      );

      await user.click(screen.getByRole("heading", { name: "Beach Weekend" }));
      const input = screen.getByDisplayValue("Beach Weekend");
      await user.clear(input);
      await user.keyboard("{Enter}");

      expect(onRenameTemplate).not.toHaveBeenCalled();
    });
  });
});
