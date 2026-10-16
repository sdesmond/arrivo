import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PackingListsView } from "./packing-lists-view";
import type { TripPackingList, PackingItem } from "@/data/types";

vi.mock("./packing-list-view", () => ({
  PackingListView: ({ items }: { items: PackingItem[] }) => (
    <div data-testid="packing-list-view">{items.map((item) => item.name).join(", ")}</div>
  ),
}));

const baseProps = {
  tripId: "trip-1",
  packingLists: [] as TripPackingList[],
  packingItems: [] as PackingItem[],
  templates: [],
  onAddItem: vi.fn().mockResolvedValue(undefined),
  onRemoveItem: vi.fn().mockResolvedValue(undefined),
  onToggleItem: vi.fn().mockResolvedValue(undefined),
  onReorderItems: vi.fn(),
  onCreateList: vi.fn().mockResolvedValue("new-list-id"),
  onRenameList: vi.fn().mockResolvedValue(undefined),
  onDeleteList: vi.fn().mockResolvedValue(undefined),
};

const lists: TripPackingList[] = [
  { id: "list-1", tripId: "trip-1", name: "Carry-On", position: 0 },
  { id: "list-2", tripId: "trip-1", name: "Checked Bag", position: 1 },
];

const items: PackingItem[] = [
  { id: "item-1", name: "Passport", done: false, tripId: "trip-1", listId: "list-1", position: 0, isLabel: false },
  { id: "item-2", name: "Charger", done: false, tripId: "trip-1", listId: "list-1", position: 1, isLabel: false },
  { id: "item-3", name: "Socks", done: false, tripId: "trip-1", listId: "list-2", position: 0, isLabel: false },
];

describe("PackingListsView — empty state", () => {
  it("shows empty state and New List button when no lists exist", () => {
    render(<PackingListsView {...baseProps} />);
    expect(screen.getByText("No packing lists yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New List" })).toBeInTheDocument();
  });
});

describe("PackingListsView — list cards", () => {
  it("renders each list as a card with its name", () => {
    render(<PackingListsView {...baseProps} packingLists={lists} packingItems={items} />);
    expect(screen.getByText("Carry-On")).toBeInTheDocument();
    expect(screen.getByText("Checked Bag")).toBeInTheDocument();
  });

  it("shows non-label item counts per list", () => {
    render(<PackingListsView {...baseProps} packingLists={lists} packingItems={items} />);
    const counts = screen.getAllByText(/\d+ items/);
    expect(counts[0]).toHaveTextContent("2 items");
    expect(counts[1]).toHaveTextContent("1 items");
  });

  it("renders rename button with accessible label", () => {
    render(<PackingListsView {...baseProps} packingLists={lists} packingItems={[]} />);
    expect(screen.getByRole("button", { name: 'Rename "Carry-On"' })).toBeInTheDocument();
  });

  it("renders delete button with accessible label", () => {
    render(<PackingListsView {...baseProps} packingLists={lists} packingItems={[]} />);
    expect(screen.getByRole("button", { name: 'Delete "Carry-On"' })).toBeInTheDocument();
  });
});

describe("PackingListsView — drill-down", () => {
  it("clicking a list card shows PackingListView", async () => {
    const user = userEvent.setup();
    render(<PackingListsView {...baseProps} packingLists={lists} packingItems={items} />);
    await user.click(screen.getByRole("button", { name: 'Open "Carry-On"' }));
    expect(screen.getByTestId("packing-list-view")).toBeInTheDocument();
  });

  it("back button returns to library index", async () => {
    const user = userEvent.setup();
    render(<PackingListsView {...baseProps} packingLists={lists} packingItems={items} />);
    await user.click(screen.getByRole("button", { name: 'Open "Carry-On"' }));
    await user.click(screen.getByRole("button", { name: /All lists/ }));
    expect(screen.getByText("Carry-On")).toBeInTheDocument();
    expect(screen.queryByTestId("packing-list-view")).not.toBeInTheDocument();
  });

  it("opens a list from the keyboard", async () => {
    const user = userEvent.setup();
    render(<PackingListsView {...baseProps} packingLists={lists} packingItems={items} />);
    const openButton = screen.getByRole("button", { name: 'Open "Carry-On"' });
    openButton.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByTestId("packing-list-view")).toBeInTheDocument();
  });

  it("clicking the drill-down title switches to an inline input", async () => {
    const user = userEvent.setup();
    render(<PackingListsView {...baseProps} packingLists={lists} packingItems={items} />);
    await user.click(screen.getByRole("button", { name: 'Open "Carry-On"' }));
    await user.click(screen.getByRole("heading", { name: "Carry-On" }));
    expect(screen.getByDisplayValue("Carry-On")).toBeInTheDocument();
  });

  it("pressing Enter on the title input calls onRenameList", async () => {
    const onRenameList = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<PackingListsView {...baseProps} packingLists={lists} packingItems={items} onRenameList={onRenameList} />);
    await user.click(screen.getByRole("button", { name: 'Open "Carry-On"' }));
    await user.click(screen.getByRole("heading", { name: "Carry-On" }));
    const input = screen.getByDisplayValue("Carry-On");
    await user.clear(input);
    await user.type(input, "Hand Luggage{Enter}");
    expect(onRenameList).toHaveBeenCalledWith("list-1", "Hand Luggage");
  });

  it("pressing Escape on the title input cancels without calling onRenameList", async () => {
    const onRenameList = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<PackingListsView {...baseProps} packingLists={lists} packingItems={items} onRenameList={onRenameList} />);
    await user.click(screen.getByRole("button", { name: 'Open "Carry-On"' }));
    await user.click(screen.getByRole("heading", { name: "Carry-On" }));
    const input = screen.getByDisplayValue("Carry-On");
    await user.clear(input);
    await user.type(input, "Hand Luggage");
    await user.keyboard("{Escape}");
    expect(onRenameList).not.toHaveBeenCalled();
  });
});

describe("PackingListsView — delete confirmation", () => {
  it("deletes immediately when list is empty (no confirm dialog)", async () => {
    const onDeleteList = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<PackingListsView {...baseProps} packingLists={lists} packingItems={[]} onDeleteList={onDeleteList} />);
    await user.click(screen.getByRole("button", { name: 'Delete "Carry-On"' }));
    expect(onDeleteList).toHaveBeenCalledWith("list-1");
    expect(screen.queryByText(/Deleting it will permanently/)).not.toBeInTheDocument();
  });

  it("shows confirmation dialog with item count for non-empty list", async () => {
    const user = userEvent.setup();
    render(
      <PackingListsView
        {...baseProps}
        packingLists={lists}
        packingItems={items}
        onDeleteList={vi.fn().mockResolvedValue(undefined)}
      />
    );
    await user.click(screen.getByRole("button", { name: 'Delete "Carry-On"' }));
    expect(screen.getByText(/This list contains 2 items/)).toBeInTheDocument();
  });

  it("calls onDeleteList on confirm", async () => {
    const onDeleteList = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<PackingListsView {...baseProps} packingLists={lists} packingItems={items} onDeleteList={onDeleteList} />);
    await user.click(screen.getByRole("button", { name: 'Delete "Carry-On"' }));
    await user.click(screen.getByRole("button", { name: "Delete List" }));
    expect(onDeleteList).toHaveBeenCalledWith("list-1");
  });
});

describe("PackingListsView — new list form", () => {
  it("clicking New List in empty state shows the form input", async () => {
    const user = userEvent.setup();
    render(<PackingListsView {...baseProps} />);
    await user.click(screen.getByRole("button", { name: "New List" }));
    expect(screen.getByLabelText("Packing list name")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("clicking New List in populated state shows the form input", async () => {
    const user = userEvent.setup();
    render(<PackingListsView {...baseProps} packingLists={lists} packingItems={[]} />);
    await user.click(screen.getByRole("button", { name: "New List" }));
    expect(screen.getByLabelText("Packing list name")).toBeInTheDocument();
  });

  it("Create button is disabled when name is empty", async () => {
    const user = userEvent.setup();
    render(<PackingListsView {...baseProps} />);
    await user.click(screen.getByRole("button", { name: "New List" }));
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
  });

  it("typing a name enables the Create button", async () => {
    const user = userEvent.setup();
    render(<PackingListsView {...baseProps} />);
    await user.click(screen.getByRole("button", { name: "New List" }));
    await user.type(screen.getByLabelText("Packing list name"), "Toiletries");
    expect(screen.getByRole("button", { name: "Create" })).not.toBeDisabled();
  });

  it("clicking Cancel dismisses the form", async () => {
    const user = userEvent.setup();
    render(<PackingListsView {...baseProps} />);
    await user.click(screen.getByRole("button", { name: "New List" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Packing list name")).not.toBeInTheDocument();
  });

  it("clicking Create calls onCreateList with the trimmed name", async () => {
    const onCreateList = vi.fn().mockResolvedValue("new-list-id");
    const user = userEvent.setup();
    render(<PackingListsView {...baseProps} onCreateList={onCreateList} />);
    await user.click(screen.getByRole("button", { name: "New List" }));
    await user.type(screen.getByLabelText("Packing list name"), "Toiletries");
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(onCreateList).toHaveBeenCalledWith("Toiletries");
  });

  it("opens the newly created list when refreshed props arrive", async () => {
    const onCreateList = vi.fn().mockResolvedValue("new-list-id");
    const user = userEvent.setup();
    const { rerender } = render(<PackingListsView {...baseProps} onCreateList={onCreateList} />);
    await user.click(screen.getByRole("button", { name: "New List" }));
    await user.type(screen.getByLabelText("Packing list name"), "Toiletries");
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(onCreateList).toHaveBeenCalledWith("Toiletries"));

    rerender(
      <PackingListsView
        {...baseProps}
        onCreateList={onCreateList}
        packingLists={[{ id: "new-list-id", tripId: "trip-1", name: "Toiletries", position: 0 }]}
        packingItems={[]}
      />
    );

    expect(await screen.findByRole("button", { name: /All lists/ })).toBeInTheDocument();
    expect(screen.getByText("Toiletries")).toBeInTheDocument();
    expect(screen.getByTestId("packing-list-view")).toBeInTheDocument();
  });

  it("pressing Enter in the name field submits the form", async () => {
    const onCreateList = vi.fn().mockResolvedValue("new-list-id");
    const user = userEvent.setup();
    render(<PackingListsView {...baseProps} onCreateList={onCreateList} />);
    await user.click(screen.getByRole("button", { name: "New List" }));
    await user.type(screen.getByLabelText("Packing list name"), "Toiletries{Enter}");
    expect(onCreateList).toHaveBeenCalledWith("Toiletries");
  });

  it("pressing Escape in the name field cancels the form", async () => {
    const user = userEvent.setup();
    render(<PackingListsView {...baseProps} />);
    await user.click(screen.getByRole("button", { name: "New List" }));
    await user.type(screen.getByLabelText("Packing list name"), "Toiletries");
    await user.keyboard("{Escape}");
    expect(screen.queryByLabelText("Packing list name")).not.toBeInTheDocument();
  });
});

describe("PackingListsView — rename", () => {
  it("clicking rename button shows the rename input", async () => {
    const user = userEvent.setup();
    render(<PackingListsView {...baseProps} packingLists={lists} packingItems={[]} />);
    await user.click(screen.getByRole("button", { name: 'Rename "Carry-On"' }));
    expect(screen.getByLabelText("Packing list name")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Carry-On")).toBeInTheDocument();
  });

  it("pressing Enter in rename input calls onRenameList", async () => {
    const onRenameList = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<PackingListsView {...baseProps} packingLists={lists} packingItems={[]} onRenameList={onRenameList} />);
    await user.click(screen.getByRole("button", { name: 'Rename "Carry-On"' }));
    const input = screen.getByDisplayValue("Carry-On");
    await user.clear(input);
    await user.type(input, "Hand Luggage{Enter}");
    expect(onRenameList).toHaveBeenCalledWith("list-1", "Hand Luggage");
  });

  it("pressing Escape in rename input cancels without calling onRenameList", async () => {
    const onRenameList = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<PackingListsView {...baseProps} packingLists={lists} packingItems={[]} onRenameList={onRenameList} />);
    await user.click(screen.getByRole("button", { name: 'Rename "Carry-On"' }));
    await user.keyboard("{Escape}");
    expect(onRenameList).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Packing list name")).not.toBeInTheDocument();
  });
});
