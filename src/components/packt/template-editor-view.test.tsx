import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TemplateEditorView } from "./template-editor-view";
import type { PackingTemplate, PackingTemplateItem } from "@/data/types";

vi.mock("./packing-list-sortable", () => ({
  PackingListSortable: ({
    items,
    onRemoveItem,
  }: {
    items: Array<{ id?: string; name: string }>;
    onRemoveItem: (item: { id?: string; name: string }) => void;
  }) => (
    <div>
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

describe("TemplateEditorView", () => {
  it("renders the empty state with the entry form controls", () => {
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
    expect(screen.getByRole("link", { name: "Back to Templates" })).toHaveAttribute("href", "/packing");
    expect(screen.getByRole("heading", { name: "This template is empty" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add item" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add label" })).toBeInTheDocument();
  });

  it("does not submit a blank item", async () => {
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

    await user.type(screen.getByRole("textbox", { name: "Template item text" }), "   ");
    await user.click(screen.getByRole("button", { name: "Add item" }));

    expect(onAddItem).not.toHaveBeenCalled();
  });

  it("submits trimmed item and label entries", async () => {
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

    const input = screen.getByRole("textbox", { name: "Template item text" });
    await user.type(input, "  Passport  ");
    await user.click(screen.getByRole("button", { name: "Add item" }));
    await user.type(input, "Documents");
    await user.click(screen.getByRole("button", { name: "Add label" }));

    expect(onAddItem).toHaveBeenNthCalledWith(1, "Passport", undefined);
    expect(onAddItem).toHaveBeenNthCalledWith(2, "Documents", true);
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
});
