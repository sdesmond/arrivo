import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  RemovePackingSectionMode,
  type PackingTemplate,
  type PackingTemplateItem,
  type RemovePackingSectionInput,
} from "@/data/types";

const { mockReorderTemplateItems } = vi.hoisted(() => ({
  mockReorderTemplateItems: vi.fn(),
}));

const mutations = vi.hoisted(() => ({
  rename: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  section: vi.fn(),
}));
const mockRenameTemplate = mutations.rename;
const rollbackSpy = vi.hoisted(() => vi.fn());
const renameFailure = vi.hoisted(() => vi.fn());
const sectionFailure = vi.hoisted(() => vi.fn());

vi.mock("./actions", () => ({
  reorderTemplateItems: mockReorderTemplateItems,
}));

vi.mock("@/lib/api/use-api-mutation", async () => {
  const contract = await import("@/lib/api/contract/packing-templates");
  return {
    useApiMutation: (endpoint: unknown) => {
      const mutate =
        endpoint === contract.createPackingTemplateItem
          ? mutations.create
          : endpoint === contract.updatePackingTemplateItem
            ? mutations.update
            : endpoint === contract.deletePackingTemplateItem
              ? mutations.remove
              : endpoint === contract.removePackingTemplateSection
                ? mutations.section
                : mutations.rename;
      return { mutate, isPending: false };
    },
  };
});

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

vi.mock("@/components/arrivo/template-editor-view", () => ({
  TemplateEditorView: ({
    items,
    isAdding,
    onAddItem,
    onEditItem,
    onOptimisticReorder,
    onRemoveItem,
    onRemoveSection,
    onReorderItems,
    onRenameTemplate,
  }: {
    onRenameTemplate: (name: string) => Promise<void>;
    items: PackingTemplateItem[];
    isAdding?: boolean;
    onAddItem: (
      text: string,
      isLabel?: boolean,
      afterItemId?: string,
      beforeItemId?: string,
      labelId?: string | null
    ) => Promise<void> | void;
    onEditItem: (id: string, text: string) => void;
    onOptimisticReorder?: (items: PackingTemplateItem[] | null) => void;
    onRemoveItem: (id: string) => void;
    onRemoveSection?: (id: string, input: RemovePackingSectionInput) => Promise<void>;
    onReorderItems: (ordered: { id: string; labelId: string | null; position: number }[], onError?: () => void) => void;
  }) => (
    <div>
      <div>items:{items.map((item) => item.text).join(",")}</div>
      <div>isAdding:{String(isAdding)}</div>
      <button onClick={() => void onRenameTemplate("Coast").catch(renameFailure)}>rename-template</button>
      <button onClick={() => void onAddItem("Sunscreen")}>add-item</button>
      <button onClick={() => void onAddItem("Sunscreen", false, "item-1", undefined, "label-1")}>add-item-after</button>
      <button onClick={() => onEditItem("item-1", "SPF 50 Sunscreen")}>edit-item</button>
      <button onClick={() => onRemoveItem("item-1")}>remove-item</button>
      <button
        onClick={() =>
          void onRemoveSection?.("label-1", {
            mode: RemovePackingSectionMode.MoveItemsToUngrouped,
          })?.catch(sectionFailure)
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
  it("sends add, edit, remove and remove-section through the API", async () => {
    const user = userEvent.setup();
    render(<TemplateEditorClient template={template} items={items} />);

    await user.click(screen.getByRole("button", { name: "add-item" }));
    await user.click(screen.getByRole("button", { name: "edit-item" }));
    await user.click(screen.getByRole("button", { name: "remove-item" }));
    await user.click(screen.getByRole("button", { name: "remove-section" }));

    await waitFor(() => {
      expect(mutations.create).toHaveBeenCalledWith(
        {
          params: { templateId: "template-1" },
          body: {
            id: expect.stringMatching(/^[0-9a-f-]{36}$/),
            text: "Sunscreen",
            isLabel: undefined,
            afterItemId: undefined,
            beforeItemId: undefined,
            labelId: undefined,
          },
        },
        expect.objectContaining({ onError: expect.any(Function), onAuthLost: expect.any(Function) })
      );
      expect(mutations.update).toHaveBeenCalledWith({
        params: { itemId: "item-1" },
        body: { text: "SPF 50 Sunscreen" },
      });
      expect(mutations.remove).toHaveBeenCalledWith({ params: { itemId: "item-1" }, body: {} });
      expect(mutations.section).toHaveBeenCalledWith(
        { params: { itemId: "label-1" }, body: { mode: RemovePackingSectionMode.MoveItemsToUngrouped } },
        expect.objectContaining({ onError: expect.any(Function) })
      );
    });
  });

  it("sends anchors and section for an inserted item", async () => {
    const user = userEvent.setup();
    render(<TemplateEditorClient template={template} items={items} />);
    await user.click(screen.getByRole("button", { name: "add-item-after" }));
    expect(mutations.create.mock.calls.at(-1)?.[0].body).toMatchObject({ afterItemId: "item-1", labelId: "label-1" });
  });

  it("clears adding on failure, reuses the id on retry and ignores a second add while one is pending", async () => {
    const user = userEvent.setup();
    mutations.create.mockClear();
    mutations.create.mockImplementationOnce(async (_input, options) => options.onError(new Error("boom")));
    mutations.create.mockImplementationOnce(async (_input, options) => options.onAuthLost());
    render(<TemplateEditorClient template={template} items={items} />);

    await user.click(screen.getByRole("button", { name: "add-item" }));
    await waitFor(() => expect(screen.getByText("isAdding:false")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "add-item" }));
    await waitFor(() => expect(mutations.create).toHaveBeenCalledTimes(2));
    expect(mutations.create.mock.calls[1][0].body.id).toBe(mutations.create.mock.calls[0][0].body.id);
    expect(screen.getByText("isAdding:false")).toBeInTheDocument();

    let finish: (() => void) | undefined;
    mutations.create.mockImplementationOnce(() => new Promise<void>((resolve) => (finish = resolve)));
    await user.click(screen.getByRole("button", { name: "add-item" }));
    await waitFor(() => expect(screen.getByText("isAdding:true")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "add-item" }));
    expect(mutations.create).toHaveBeenCalledTimes(3);
    finish?.();
  });

  it("rethrows a failed section removal to the dialog", async () => {
    const user = userEvent.setup();
    const error = new Error("Section gone");
    mutations.section.mockImplementationOnce(async (_input, options) => options.onError(error));
    render(<TemplateEditorClient template={template} items={items} />);
    await user.click(screen.getByRole("button", { name: "remove-section" }));
    await waitFor(() => expect(sectionFailure).toHaveBeenCalledWith(error));

    mutations.section.mockImplementationOnce(async (_input, options) => options.onAuthLost());
    await user.click(screen.getByRole("button", { name: "remove-section" }));
    await waitFor(() => expect(sectionFailure).toHaveBeenCalledWith(new Error("Your session has expired.")));
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

it("renames the editor template through the API", async () => {
  mockRenameTemplate.mockImplementationOnce(async (_input, options) => options.onSuccess());
  const user = userEvent.setup();
  render(<TemplateEditorClient template={template} items={items} />);
  await user.click(screen.getByRole("button", { name: "rename-template" }));
  expect(mockRenameTemplate).toHaveBeenCalledWith(
    { params: { templateId: "template-1" }, body: { name: "Coast" } },
    expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) })
  );
});

it("propagates a failed editor rename", async () => {
  const error = new Error("Rename failed");
  mockRenameTemplate.mockImplementationOnce(async (_input, options) => options.onError(error));
  const user = userEvent.setup();
  render(<TemplateEditorClient template={template} items={items} />);
  await user.click(screen.getByRole("button", { name: "rename-template" }));
  await waitFor(() => expect(renameFailure).toHaveBeenCalledWith(error));
});
