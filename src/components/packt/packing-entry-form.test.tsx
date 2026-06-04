import { useState, type ChangeEvent, type ReactElement } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PackingEntryForm } from "./packing-entry-form";

interface PackingEntryFormHarnessProps {
  hasItems: boolean;
  onAddItem: (name: string, isLabel?: boolean) => Promise<void>;
}

function PackingEntryFormHarness({ hasItems, onAddItem }: PackingEntryFormHarnessProps): ReactElement {
  const [draftName, setDraftName] = useState("");

  function handleDraftNameChange(event: ChangeEvent<HTMLInputElement>): void {
    setDraftName(event.target.value);
  }

  async function handleSubmitItem(): Promise<void> {
    await onAddItem(draftName, undefined);
    setDraftName("");
  }

  async function handleSubmitLabel(): Promise<void> {
    await onAddItem(draftName, true);
    setDraftName("");
  }

  return (
    <PackingEntryForm
      draftName={draftName}
      hasItems={hasItems}
      isSubmitting={false}
      onDraftNameChange={handleDraftNameChange}
      onSubmitItem={handleSubmitItem}
      onSubmitLabel={handleSubmitLabel}
    />
  );
}

describe("PackingEntryForm", () => {
  it("submits a plain-text item from the form", async () => {
    const user = userEvent.setup();
    const onAddItem = vi.fn(async () => undefined);

    render(<PackingEntryFormHarness hasItems={false} onAddItem={onAddItem} />);

    await user.type(screen.getByRole("textbox", { name: "Packing item name" }), "Passport");
    await user.click(screen.getByRole("button", { name: "Add item" }));

    expect(onAddItem).toHaveBeenCalledWith("Passport", undefined);
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Packing item name" })).toHaveValue(""));
  });

  it("submits a section label from the form", async () => {
    const user = userEvent.setup();
    const onAddItem = vi.fn(async () => undefined);

    render(<PackingEntryFormHarness hasItems={false} onAddItem={onAddItem} />);

    await user.type(screen.getByRole("textbox", { name: "Packing item name" }), "Documents");
    await user.click(screen.getByRole("button", { name: "Add label" }));

    expect(onAddItem).toHaveBeenCalledWith("Documents", true);
  });

  it("submits an item from the entry form when the list already has items", async () => {
    const user = userEvent.setup();
    const onAddItem = vi.fn(async () => undefined);

    render(<PackingEntryFormHarness hasItems onAddItem={onAddItem} />);

    await user.type(screen.getByRole("textbox", { name: "Packing item name" }), "Tent");
    await user.click(screen.getByRole("button", { name: "Add item" }));

    expect(onAddItem).toHaveBeenCalledWith("Tent", undefined);
  });

  it("submits a label from the entry form when the list already has items", async () => {
    const user = userEvent.setup();
    const onAddItem = vi.fn(async () => undefined);

    render(<PackingEntryFormHarness hasItems onAddItem={onAddItem} />);

    await user.type(screen.getByRole("textbox", { name: "Packing item name" }), "Camping");
    await user.click(screen.getByRole("button", { name: "Add label" }));

    expect(onAddItem).toHaveBeenCalledWith("Camping", true);
  });

  it("disables both buttons when isSubmitting is true", () => {
    render(
      <PackingEntryForm
        draftName="Test"
        hasItems={false}
        isSubmitting
        onDraftNameChange={vi.fn()}
        onSubmitItem={vi.fn()}
        onSubmitLabel={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Add item" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add label" })).toBeDisabled();
  });
});
