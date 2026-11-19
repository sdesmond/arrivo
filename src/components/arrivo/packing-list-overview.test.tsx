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
