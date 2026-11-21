import { expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PackingListOverview } from "./packing-list-overview";
it("opens a list and shows only non-label item counts", async () => {
  const onOpen = vi.fn();
  render(
    <PackingListOverview
      packingLists={[{ id: "list", tripId: "trip", name: "Bag", position: 0 }]}
      packingItems={[
        { name: "Socks", done: false, listId: "list" },
        { name: "Clothes", done: false, isLabel: true, listId: "list" },
      ]}
      onOpen={onOpen}
      onCreated={vi.fn()}
      onCreateList={vi.fn()}
      onRenameList={vi.fn()}
      onDeleteList={vi.fn()}
    />
  );
  expect(screen.getByText("1 items")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: 'Open "Bag"' }));
  expect(onOpen).toHaveBeenCalledWith("list");
});

it("gives list controls 44px targets", async () => {
  render(
    <PackingListOverview
      packingLists={[{ id: "list", tripId: "trip", name: "Bag", position: 0 }]}
      packingItems={[]}
      onOpen={vi.fn()}
      onCreated={vi.fn()}
      onCreateList={vi.fn()}
      onRenameList={vi.fn()}
      onDeleteList={vi.fn()}
    />
  );
  expect(screen.getByRole("button", { name: 'Open "Bag"' })).toHaveClass("min-h-11");
  expect(screen.getByRole("button", { name: 'Rename "Bag"' })).toHaveClass("size-11");
  expect(screen.getByRole("button", { name: 'Delete "Bag"' })).toHaveClass("size-11");
  await userEvent.click(screen.getByRole("button", { name: 'Rename "Bag"' }));
  expect(screen.getByRole("textbox", { name: "Packing list name" })).toHaveClass("h-11");
});

it("shows the create form's empty state when there are no lists", () => {
  render(
    <PackingListOverview
      packingLists={[]}
      packingItems={[]}
      onOpen={vi.fn()}
      onCreated={vi.fn()}
      onCreateList={vi.fn()}
      onRenameList={vi.fn()}
      onDeleteList={vi.fn()}
    />
  );
  expect(screen.getByText("No packing lists yet")).toBeInTheDocument();
});

it("deletes an empty list without asking", async () => {
  const onDeleteList = vi.fn(async () => {});
  render(
    <PackingListOverview
      packingLists={[{ id: "list", tripId: "trip", name: "Bag", position: 0 }]}
      packingItems={[{ name: "Clothes", done: false, isLabel: true, listId: "list" }]}
      onOpen={vi.fn()}
      onCreated={vi.fn()}
      onCreateList={vi.fn()}
      onRenameList={vi.fn()}
      onDeleteList={onDeleteList}
    />
  );
  await userEvent.click(screen.getByRole("button", { name: 'Delete "Bag"' }));
  expect(onDeleteList).toHaveBeenCalledWith("list");
  expect(screen.queryByRole("button", { name: "Delete List" })).not.toBeInTheDocument();
});

it("confirms before deleting a list that has items", async () => {
  const onDeleteList = vi.fn(async () => {});
  render(
    <PackingListOverview
      packingLists={[{ id: "list", tripId: "trip", name: "Bag", position: 0 }]}
      packingItems={[{ name: "Socks", done: false, listId: "list" }]}
      onOpen={vi.fn()}
      onCreated={vi.fn()}
      onCreateList={vi.fn()}
      onRenameList={vi.fn()}
      onDeleteList={onDeleteList}
    />
  );
  await userEvent.click(screen.getByRole("button", { name: 'Delete "Bag"' }));
  expect(onDeleteList).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Delete List" }));
  expect(onDeleteList).toHaveBeenCalledWith("list");
});

it("shows a committed rename immediately while the save is still in flight", async () => {
  const onRenameList = vi.fn(() => new Promise<void>(() => {}));
  render(
    <PackingListOverview
      packingLists={[{ id: "list", tripId: "trip", name: "Bag", position: 0 }]}
      packingItems={[]}
      onOpen={vi.fn()}
      onCreated={vi.fn()}
      onCreateList={vi.fn()}
      onRenameList={onRenameList}
      onDeleteList={vi.fn()}
    />
  );
  await userEvent.click(screen.getByRole("button", { name: 'Rename "Bag"' }));
  const input = screen.getByRole("textbox", { name: "Packing list name" });
  await userEvent.clear(input);
  await userEvent.type(input, "Carry-On{Enter}");
  expect(onRenameList).toHaveBeenCalledWith("list", "Carry-On");
  expect(screen.getByRole("button", { name: 'Open "Carry-On"' })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: 'Open "Bag"' })).not.toBeInTheDocument();
});

it("ends the rename override when the stored name changes", async () => {
  const props = {
    packingItems: [],
    onOpen: vi.fn(),
    onCreated: vi.fn(),
    onCreateList: vi.fn(),
    onRenameList: vi.fn(() => new Promise<void>(() => {})),
    onDeleteList: vi.fn(),
  };
  const { rerender } = render(
    <PackingListOverview {...props} packingLists={[{ id: "list", tripId: "trip", name: "Bag", position: 0 }]} />
  );
  await userEvent.click(screen.getByRole("button", { name: 'Rename "Bag"' }));
  const input = screen.getByRole("textbox", { name: "Packing list name" });
  await userEvent.clear(input);
  await userEvent.type(input, "Mine{Enter}");
  expect(screen.getByRole("button", { name: 'Open "Mine"' })).toBeInTheDocument();
  rerender(
    <PackingListOverview {...props} packingLists={[{ id: "list", tripId: "trip", name: "Theirs", position: 0 }]} />
  );
  expect(screen.getByRole("button", { name: 'Open "Theirs"' })).toBeInTheDocument();
});
