import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  RemovePackingSectionMode,
  type PackingTemplate,
  type PackingTemplateItem,
  type RemovePackingSectionInput,
} from "@/data/types";

const {
  mockAddTemplateItem,
  mockRemoveTemplateItem,
  mockRemoveTemplateSection,
  mockReorderTemplateItems,
  mockUpdateTemplateItem,
} = vi.hoisted(() => ({
  mockAddTemplateItem: vi.fn(),
  mockRemoveTemplateItem: vi.fn(),
  mockRemoveTemplateSection: vi.fn(),
  mockReorderTemplateItems: vi.fn(),
  mockUpdateTemplateItem: vi.fn(),
}));

const mockRenameTemplate = vi.hoisted(() => vi.fn());
const rollbackSpy = vi.hoisted(() => vi.fn());

vi.mock("./actions", () => ({
  addTemplateItem: mockAddTemplateItem,
  removeTemplateItem: mockRemoveTemplateItem,
  removeTemplateSection: mockRemoveTemplateSection,
  reorderTemplateItems: mockReorderTemplateItems,
  updateTemplateItem: mockUpdateTemplateItem,
}));

vi.mock("../actions", () => ({
  renameTemplate: mockRenameTemplate,
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

vi.mock("@/components/packt/template-editor-view", () => ({
  TemplateEditorView: ({
    items,
    isAdding,
    onAddItem,
    onEditItem,
    onOptimisticReorder,
    onRemoveItem,
    onRemoveSection,
    onReorderItems,
  }: {
    items: PackingTemplateItem[];
    isAdding?: boolean;
    onAddItem: (
      text: string,
      isLabel?: boolean,
      afterItemId?: string,
      beforeItemId?: string,
      labelId?: string | null
    ) => void;
    onEditItem: (id: string, text: string) => void;
    onOptimisticReorder?: (items: PackingTemplateItem[] | null) => void;
    onRemoveItem: (id: string) => void;
    onRemoveSection?: (id: string, input: RemovePackingSectionInput) => Promise<void>;
    onReorderItems: (ordered: { id: string; labelId: string | null; position: number }[], onError?: () => void) => void;
  }) => (
    <div>
      <div>items:{items.map((item) => item.text).join(",")}</div>
      <div>isAdding:{String(isAdding)}</div>
      <button onClick={() => onAddItem("Sunscreen")}>add-item</button>
      <button onClick={() => onEditItem("item-1", "SPF 50 Sunscreen")}>edit-item</button>
      <button onClick={() => onRemoveItem("item-1")}>remove-item</button>
      <button
        onClick={() =>
          void onRemoveSection?.("label-1", {
            mode: RemovePackingSectionMode.MoveItemsToUngrouped,
          })
        }
      >
        remove-section
      </button>
      <button
        onClick={() =>
          onOptimisticReorder?.([
            {
              id: "item-2",
              templateId: "template-1",
              text: "Towel",
              isLabel: false,
              position: 0,
              labelId: null,
            },
            {
              id: "item-1",
              templateId: "template-1",
              text: "Sunscreen",
              isLabel: false,
              position: 1,
              labelId: null,
            },
          ])
        }
      >
        optimistic-reorder
      </button>
      <button
        onClick={() =>
          onReorderItems(
            [
              { id: "item-2", labelId: null, position: 0 },
              { id: "item-1", labelId: null, position: 1 },
            ],
            rollbackSpy
          )
        }
      >
        reorder-items
      </button>
    </div>
  ),
}));

import { toast } from "sonner";
import { TemplateEditorClient } from "./page-client";

const template: PackingTemplate = {
  id: "template-1",
  name: "Beach Weekend",
};

const items: PackingTemplateItem[] = [
  { id: "item-1", templateId: "template-1", text: "Sunscreen", isLabel: false, position: 0, labelId: null },
  { id: "item-2", templateId: "template-1", text: "Towel", isLabel: false, position: 1, labelId: null },
];

describe("TemplateEditorClient", () => {
  it("wires add, edit, remove, and remove-section actions to the server actions", async () => {
    const user = userEvent.setup();
    mockAddTemplateItem.mockResolvedValueOnce({ id: "item-3" });
    mockUpdateTemplateItem.mockResolvedValueOnce(undefined);
    mockRemoveTemplateItem.mockResolvedValueOnce(undefined);
    mockRemoveTemplateSection.mockResolvedValueOnce(undefined);

    render(<TemplateEditorClient template={template} items={items} />);

    await user.click(screen.getByRole("button", { name: "add-item" }));
    await user.click(screen.getByRole("button", { name: "edit-item" }));
    await user.click(screen.getByRole("button", { name: "remove-item" }));
    await user.click(screen.getByRole("button", { name: "remove-section" }));

    await waitFor(() => {
      expect(mockAddTemplateItem).toHaveBeenCalledWith("template-1", {
        text: "Sunscreen",
        isLabel: undefined,
        afterItemId: undefined,
        beforeItemId: undefined,
        labelId: undefined,
      });
      expect(mockUpdateTemplateItem).toHaveBeenCalledWith("item-1", { text: "SPF 50 Sunscreen" });
      expect(mockRemoveTemplateItem).toHaveBeenCalledWith("item-1");
      expect(mockRemoveTemplateSection).toHaveBeenCalledWith("label-1", {
        mode: RemovePackingSectionMode.MoveItemsToUngrouped,
      });
    });
  });

  it("shows optimistic reorder items and clears them when server props refresh", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<TemplateEditorClient template={template} items={items} />);

    expect(screen.getByText("items:Sunscreen,Towel")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "optimistic-reorder" }));
    expect(screen.getByText("items:Towel,Sunscreen")).toBeInTheDocument();

    rerender(
      <TemplateEditorClient
        template={template}
        items={[
          { id: "item-3", templateId: "template-1", text: "Passport", isLabel: false, position: 0, labelId: null },
        ]}
      />
    );

    expect(screen.getByText("items:Passport")).toBeInTheDocument();
    expect(screen.getByText("isAdding:false")).toBeInTheDocument();
  });

  it("keeps add pending until props refresh and reports failures with a toast", async () => {
    const user = userEvent.setup();
    let resolveAdd: (() => void) | undefined;
    mockAddTemplateItem.mockImplementationOnce(
      () =>
        new Promise<{ id: string }>((resolve) => {
          resolveAdd = () => resolve({ id: "item-3" });
        })
    );

    render(<TemplateEditorClient template={template} items={items} />);

    await user.click(screen.getByRole("button", { name: "add-item" }));
    await waitFor(() => expect(screen.getByText("isAdding:true")).toBeInTheDocument());

    resolveAdd?.();

    mockUpdateTemplateItem.mockRejectedValueOnce(new Error("Update failed"));
    await user.click(screen.getByRole("button", { name: "edit-item" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Update failed"));
  });

  it("rolls back optimistic reorder state when reorder fails", async () => {
    const user = userEvent.setup();
    mockReorderTemplateItems.mockRejectedValueOnce(new Error("Reorder failed"));

    render(<TemplateEditorClient template={template} items={items} />);

    await user.click(screen.getByRole("button", { name: "reorder-items" }));

    await waitFor(() => {
      expect(mockReorderTemplateItems).toHaveBeenCalledWith("template-1", [
        { id: "item-2", labelId: null, position: 0 },
        { id: "item-1", labelId: null, position: 1 },
      ]);
      expect(rollbackSpy).toHaveBeenCalledOnce();
      expect(toast.error).toHaveBeenCalledWith("Reorder failed");
    });
  });
});
