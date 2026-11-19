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
  await userEvent.keyboard("{Escape}");
  const newList = screen.getByRole("button", { name: "New List" });
  expect(newList).toHaveClass("h-11");
  await userEvent.click(newList);
  expect(screen.getByRole("textbox", { name: "Packing list name" })).toHaveClass("h-11");
  expect(screen.getByRole("button", { name: "Create" })).toHaveClass("h-11");
  expect(screen.getByRole("button", { name: "Cancel" })).toHaveClass("h-11");
});

it("gives the empty-state create button a 44px target", () => {
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
  expect(screen.getByRole("button", { name: "New List" })).toHaveClass("h-11");
});
