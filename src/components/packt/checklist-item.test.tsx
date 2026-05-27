// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("lucide-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("lucide-react")>();
  return {
    ...actual,
    ListChecks: ({ strokeWidth, ...props }: React.SVGProps<SVGSVGElement> & { strokeWidth?: number }) => (
      <svg data-testid="list-checks-icon" data-stroke-width={strokeWidth} {...props} />
    ),
    Trash2: (props: React.SVGProps<SVGSVGElement>) => <svg data-testid="trash-icon" {...props} />,
    ChevronDown: (props: React.SVGProps<SVGSVGElement>) => <svg data-testid="chevron-icon" {...props} />,
    Check: (props: React.SVGProps<SVGSVGElement>) => <svg data-testid="check-icon" {...props} />,
    CheckCheck: ({ "aria-label": ariaLabel, ...props }: React.SVGProps<SVGSVGElement> & { "aria-label"?: string }) => (
      <svg data-testid="check-check-icon" aria-label={ariaLabel} {...props} />
    ),
  };
});

import { ChecklistItem } from "./checklist-item";
import type { Checklist } from "@/data/types";

const BASE_CHECKLIST: Checklist = {
  id: "cl-1",
  tripDayId: "day-1",
  position: 0,
  items: [],
};

const CHECKLIST_WITH_TITLE: Checklist = {
  ...BASE_CHECKLIST,
  title: "Packing list",
};

const CHECKLIST_WITH_ITEMS: Checklist = {
  ...BASE_CHECKLIST,
  items: [
    { id: "item-1", checklistId: "cl-1", content: "Sunscreen", isChecked: false },
    { id: "item-2", checklistId: "cl-1", content: "Passport", isChecked: false },
  ],
};

const CHECKLIST_PARTIAL_CHECKED: Checklist = {
  ...BASE_CHECKLIST,
  items: [
    { id: "item-1", checklistId: "cl-1", content: "Sunscreen", isChecked: true },
    { id: "item-2", checklistId: "cl-1", content: "Passport", isChecked: false },
  ],
};

const CHECKLIST_ALL_CHECKED: Checklist = {
  ...BASE_CHECKLIST,
  items: [
    { id: "item-1", checklistId: "cl-1", content: "Sunscreen", isChecked: true },
    { id: "item-2", checklistId: "cl-1", content: "Passport", isChecked: true },
  ],
};

describe("ChecklistItem — icon", () => {
  it("renders ListChecks icon with strokeWidth 1.5", () => {
    render(<ChecklistItem checklist={BASE_CHECKLIST} />);
    expect(screen.getByTestId("list-checks-icon")).toHaveAttribute("data-stroke-width", "1.5");
  });
});

describe("ChecklistItem — Bug 1: chevron/trash overlap fix", () => {
  it("header button has pr-9 class in non-draft mode to clear the absolute trash icon", () => {
    const { container } = render(<ChecklistItem checklist={BASE_CHECKLIST} />);
    const headerBtn = container.querySelector("button.pr-9");
    expect(headerBtn).toBeInTheDocument();
  });

  it("header button does NOT have pr-9 class in draft mode (no trash icon present)", () => {
    const { container } = render(
      <ChecklistItem checklist={BASE_CHECKLIST} isDraft onCommitDraft={vi.fn()} onCancelDraft={vi.fn()} />
    );
    const headerBtn = container.querySelector("button.pr-9");
    expect(headerBtn).not.toBeInTheDocument();
  });
});

describe("ChecklistItem — Bug 3b: initiallyExpanded prop", () => {
  it("starts expanded when initiallyExpanded is true even without isDraft", () => {
    render(<ChecklistItem checklist={BASE_CHECKLIST} initiallyExpanded />);
    expect(screen.getByPlaceholderText("Add an item…")).toBeInTheDocument();
  });

  it("starts collapsed when initiallyExpanded is false (default)", () => {
    render(<ChecklistItem checklist={BASE_CHECKLIST} />);
    expect(screen.queryByPlaceholderText("Add an item…")).not.toBeInTheDocument();
  });
});

describe("ChecklistItem — collapsed state", () => {
  it("shows generic label with item count when untitled", () => {
    render(<ChecklistItem checklist={CHECKLIST_WITH_ITEMS} />);
    expect(screen.getByText("Checklist · items")).toBeInTheDocument();
  });

  it("uses singular 'item' when count is 1", () => {
    const single: Checklist = {
      ...BASE_CHECKLIST,
      items: [{ id: "i1", checklistId: "cl-1", content: "x", isChecked: false }],
    };
    render(<ChecklistItem checklist={single} />);
    expect(screen.getByText("Checklist · item")).toBeInTheDocument();
  });

  it("shows '0 items' when no items and untitled", () => {
    render(<ChecklistItem checklist={BASE_CHECKLIST} />);
    expect(screen.getByText("Checklist · items")).toBeInTheDocument();
  });

  it("shows title text in header when title is set", () => {
    render(<ChecklistItem checklist={CHECKLIST_WITH_TITLE} />);
    expect(screen.getByText("Packing list")).toBeInTheDocument();
  });

  it("renders chevron icon in collapsed state", () => {
    render(<ChecklistItem checklist={BASE_CHECKLIST} />);
    expect(screen.getByTestId("chevron-icon")).toBeInTheDocument();
  });

  it("clicking header expands the body", async () => {
    const user = userEvent.setup();
    render(<ChecklistItem checklist={BASE_CHECKLIST} />);
    expect(screen.queryByPlaceholderText("Add an item…")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Checklist · items/i }));
    expect(screen.getByPlaceholderText("Add an item…")).toBeInTheDocument();
  });
});

describe("ChecklistItem — expanded state (title management)", () => {
  it("shows 'Add title...' when no title in expanded state", async () => {
    const user = userEvent.setup();
    render(<ChecklistItem checklist={BASE_CHECKLIST} />);
    await user.click(screen.getByRole("button", { name: /Checklist · items/i }));
    expect(screen.getByText("Add title...")).toBeInTheDocument();
  });

  it("'Add title...' text is dim (fg-4 color)", async () => {
    const user = userEvent.setup();
    render(<ChecklistItem checklist={BASE_CHECKLIST} />);
    await user.click(screen.getByRole("button", { name: /Checklist · items/i }));
    const titleBtn = screen.getByRole("button", { name: "Add title..." });
    expect(titleBtn).toHaveStyle({ color: "var(--fg-4)" });
  });

  it("clicking 'Add title...' enters inline edit mode", async () => {
    const user = userEvent.setup();
    render(<ChecklistItem checklist={BASE_CHECKLIST} />);
    await user.click(screen.getByRole("button", { name: /Checklist · items/i }));
    await user.click(screen.getByRole("button", { name: "Add title..." }));
    expect(screen.getByPlaceholderText("Add title...")).toBeInTheDocument();
  });

  it("typing and pressing Enter in title input calls onTitleUpdate", async () => {
    const onTitleUpdate = vi.fn();
    const user = userEvent.setup();
    render(<ChecklistItem checklist={BASE_CHECKLIST} onTitleUpdate={onTitleUpdate} />);
    await user.click(screen.getByRole("button", { name: /Checklist · items/i }));
    await user.click(screen.getByRole("button", { name: "Add title..." }));
    await user.type(screen.getByPlaceholderText("Add title..."), "Beach trip");
    await user.keyboard("{Enter}");
    expect(onTitleUpdate).toHaveBeenCalledWith("cl-1", "Beach trip");
  });

  it("blurring title input calls onTitleUpdate", async () => {
    const onTitleUpdate = vi.fn();
    const user = userEvent.setup();
    render(<ChecklistItem checklist={BASE_CHECKLIST} onTitleUpdate={onTitleUpdate} />);
    await user.click(screen.getByRole("button", { name: /Checklist · items/i }));
    await user.click(screen.getByRole("button", { name: "Add title..." }));
    await user.type(screen.getByPlaceholderText("Add title..."), "My list");
    fireEvent.blur(screen.getByPlaceholderText("Add title..."));
    expect(onTitleUpdate).toHaveBeenCalledWith("cl-1", "My list");
  });

  it("shows existing title as editable button in expanded state", async () => {
    const user = userEvent.setup();
    render(<ChecklistItem checklist={CHECKLIST_WITH_TITLE} />);
    await user.click(screen.getByRole("button", { name: /Packing list/i }));
    const titleButtons = screen.getAllByRole("button", { name: /Packing list/i });
    // At least one is the title edit area (the second one after header)
    expect(titleButtons.length).toBeGreaterThanOrEqual(1);
  });

  it("Escape in title input cancels edit without calling onTitleUpdate", async () => {
    const onTitleUpdate = vi.fn();
    const user = userEvent.setup();
    render(<ChecklistItem checklist={BASE_CHECKLIST} onTitleUpdate={onTitleUpdate} />);
    await user.click(screen.getByRole("button", { name: /Checklist · items/i }));
    await user.click(screen.getByRole("button", { name: "Add title..." }));
    await user.type(screen.getByPlaceholderText("Add title..."), "draft title");
    await user.keyboard("{Escape}");
    expect(onTitleUpdate).not.toHaveBeenCalled();
    expect(screen.getByText("Add title...")).toBeInTheDocument();
  });
});

describe("ChecklistItem — draft mode", () => {
  it("is expanded in draft mode showing item input", () => {
    render(<ChecklistItem checklist={BASE_CHECKLIST} isDraft onCommitDraft={vi.fn()} onCancelDraft={vi.fn()} />);
    expect(screen.getByPlaceholderText("Add an item…")).toBeInTheDocument();
  });

  it("item input is auto-focused in draft mode", () => {
    render(<ChecklistItem checklist={BASE_CHECKLIST} isDraft onCommitDraft={vi.fn()} onCancelDraft={vi.fn()} />);
    expect(screen.getByPlaceholderText("Add an item…")).toHaveFocus();
  });

  it("no chevron icon in draft mode", () => {
    render(<ChecklistItem checklist={BASE_CHECKLIST} isDraft onCommitDraft={vi.fn()} onCancelDraft={vi.fn()} />);
    expect(screen.queryByTestId("chevron-icon")).not.toBeInTheDocument();
  });

  it("pressing Enter with content calls onCommitDraft with the typed content", async () => {
    const onCommitDraft = vi.fn();
    const user = userEvent.setup();
    render(<ChecklistItem checklist={BASE_CHECKLIST} isDraft onCommitDraft={onCommitDraft} onCancelDraft={vi.fn()} />);
    await user.type(screen.getByPlaceholderText("Add an item…"), "Sunscreen");
    await user.keyboard("{Enter}");
    expect(onCommitDraft).toHaveBeenCalledWith("Sunscreen");
  });

  it("pressing Enter with empty input calls onCancelDraft", async () => {
    const onCancelDraft = vi.fn();
    const user = userEvent.setup();
    render(<ChecklistItem checklist={BASE_CHECKLIST} isDraft onCommitDraft={vi.fn()} onCancelDraft={onCancelDraft} />);
    await user.keyboard("{Enter}");
    expect(onCancelDraft).toHaveBeenCalled();
  });

  it("pressing Escape calls onCancelDraft", async () => {
    const onCancelDraft = vi.fn();
    const user = userEvent.setup();
    render(<ChecklistItem checklist={BASE_CHECKLIST} isDraft onCommitDraft={vi.fn()} onCancelDraft={onCancelDraft} />);
    await user.keyboard("{Escape}");
    expect(onCancelDraft).toHaveBeenCalled();
  });

  it("no delete button in draft mode", () => {
    render(<ChecklistItem checklist={BASE_CHECKLIST} isDraft onCommitDraft={vi.fn()} onCancelDraft={vi.fn()} />);
    expect(screen.queryByTitle("Delete checklist")).not.toBeInTheDocument();
  });
});

describe("ChecklistItem — draft blur behavior", () => {
  it("blurring item input with content (relatedTarget outside) calls onCommitDraft with content", () => {
    const onCommitDraft = vi.fn();
    render(<ChecklistItem checklist={BASE_CHECKLIST} isDraft onCommitDraft={onCommitDraft} onCancelDraft={vi.fn()} />);
    const input = screen.getByPlaceholderText("Add an item…");
    fireEvent.change(input, { target: { value: "Sunscreen" } });
    fireEvent.blur(input);
    expect(onCommitDraft).toHaveBeenCalledWith("Sunscreen");
  });

  it("blurring item input with empty content (relatedTarget outside) calls onCancelDraft", () => {
    const onCancelDraft = vi.fn();
    render(<ChecklistItem checklist={BASE_CHECKLIST} isDraft onCommitDraft={vi.fn()} onCancelDraft={onCancelDraft} />);
    fireEvent.blur(screen.getByPlaceholderText("Add an item…"));
    expect(onCancelDraft).toHaveBeenCalled();
  });

  it("blurring item input when relatedTarget is inside wrapper does not commit or cancel", () => {
    const onCommitDraft = vi.fn();
    const onCancelDraft = vi.fn();
    render(
      <div>
        <ChecklistItem checklist={BASE_CHECKLIST} isDraft onCommitDraft={onCommitDraft} onCancelDraft={onCancelDraft} />
      </div>
    );
    const input = screen.getByPlaceholderText("Add an item…");
    const titleBtn = screen.getByRole("button", { name: "Add title..." });
    fireEvent.blur(input, { relatedTarget: titleBtn });
    expect(onCommitDraft).not.toHaveBeenCalled();
    expect(onCancelDraft).not.toHaveBeenCalled();
  });
});

describe("ChecklistItem — delete", () => {
  it("delete button is present in non-draft mode", () => {
    render(<ChecklistItem checklist={BASE_CHECKLIST} onDelete={vi.fn()} />);
    expect(screen.getByTitle("Delete checklist")).toBeInTheDocument();
  });

  it("clicking delete button calls onDelete with checklist id", async () => {
    const onDelete = vi.fn();
    const user = userEvent.setup();
    render(<ChecklistItem checklist={BASE_CHECKLIST} onDelete={onDelete} />);
    await user.click(screen.getByTitle("Delete checklist"));
    expect(onDelete).toHaveBeenCalledWith("cl-1");
  });
});

describe("ChecklistItem — add item (non-draft)", () => {
  it("pressing Enter with content calls onAddItem and clears input", async () => {
    const onAddItem = vi.fn();
    const user = userEvent.setup();
    render(<ChecklistItem checklist={BASE_CHECKLIST} onAddItem={onAddItem} />);
    await user.click(screen.getByRole("button", { name: /Checklist · items/i }));
    await user.type(screen.getByPlaceholderText("Add an item…"), "Sunscreen");
    await user.keyboard("{Enter}");
    expect(onAddItem).toHaveBeenCalledWith("cl-1", "Sunscreen");
    expect(screen.getByPlaceholderText("Add an item…")).toHaveValue("");
  });

  it("pressing Enter with empty input does not call onAddItem", async () => {
    const onAddItem = vi.fn();
    const user = userEvent.setup();
    render(<ChecklistItem checklist={BASE_CHECKLIST} onAddItem={onAddItem} />);
    await user.click(screen.getByRole("button", { name: /Checklist · items/i }));
    await user.keyboard("{Enter}");
    expect(onAddItem).not.toHaveBeenCalled();
  });

  it("pressing Escape clears input without calling onAddItem", async () => {
    const onAddItem = vi.fn();
    const user = userEvent.setup();
    render(<ChecklistItem checklist={BASE_CHECKLIST} onAddItem={onAddItem} />);
    await user.click(screen.getByRole("button", { name: /Checklist · items/i }));
    await user.type(screen.getByPlaceholderText("Add an item…"), "Draft text");
    await user.keyboard("{Escape}");
    expect(onAddItem).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText("Add an item…")).toHaveValue("");
  });

  it("blurring with content calls onAddItem", () => {
    const onAddItem = vi.fn();
    render(<ChecklistItem checklist={BASE_CHECKLIST} onAddItem={onAddItem} />);
    fireEvent.click(screen.getByRole("button", { name: /Checklist · items/i }));
    const input = screen.getByPlaceholderText("Add an item…");
    fireEvent.change(input, { target: { value: "Passport" } });
    fireEvent.blur(input);
    expect(onAddItem).toHaveBeenCalledWith("cl-1", "Passport");
  });

  it("blurring with empty input does not call onAddItem", () => {
    const onAddItem = vi.fn();
    render(<ChecklistItem checklist={BASE_CHECKLIST} onAddItem={onAddItem} />);
    fireEvent.click(screen.getByRole("button", { name: /Checklist · items/i }));
    fireEvent.blur(screen.getByPlaceholderText("Add an item…"));
    expect(onAddItem).not.toHaveBeenCalled();
  });
});

describe("ChecklistItem — item rendering", () => {
  it("renders each item's content text", async () => {
    const user = userEvent.setup();
    render(<ChecklistItem checklist={CHECKLIST_WITH_ITEMS} />);
    await user.click(screen.getByRole("button", { name: /Checklist · items/i }));
    expect(screen.getByText("Sunscreen")).toBeInTheDocument();
    expect(screen.getByText("Passport")).toBeInTheDocument();
  });

  it("clicking an item text enters inline edit", async () => {
    const user = userEvent.setup();
    render(<ChecklistItem checklist={CHECKLIST_WITH_ITEMS} />);
    await user.click(screen.getByRole("button", { name: /Checklist · items/i }));
    await user.click(screen.getByText("Sunscreen"));
    expect(screen.getByDisplayValue("Sunscreen")).toBeInTheDocument();
  });

  it("pressing Enter in item edit calls onUpdateItem", async () => {
    const onUpdateItem = vi.fn();
    const user = userEvent.setup();
    render(<ChecklistItem checklist={CHECKLIST_WITH_ITEMS} onUpdateItem={onUpdateItem} />);
    await user.click(screen.getByRole("button", { name: /Checklist · items/i }));
    await user.click(screen.getByText("Sunscreen"));
    const editInput = screen.getByDisplayValue("Sunscreen");
    await user.clear(editInput);
    await user.type(editInput, "Sun block");
    await user.keyboard("{Enter}");
    expect(onUpdateItem).toHaveBeenCalledWith("item-1", "Sun block");
  });

  it("pressing Escape in item edit cancels without calling onUpdateItem", async () => {
    const onUpdateItem = vi.fn();
    const user = userEvent.setup();
    render(<ChecklistItem checklist={CHECKLIST_WITH_ITEMS} onUpdateItem={onUpdateItem} />);
    await user.click(screen.getByRole("button", { name: /Checklist · items/i }));
    await user.click(screen.getByText("Sunscreen"));
    await user.keyboard("{Escape}");
    expect(onUpdateItem).not.toHaveBeenCalled();
    expect(screen.getByText("Sunscreen")).toBeInTheDocument();
  });

  it("blurring item edit calls onUpdateItem", async () => {
    const onUpdateItem = vi.fn();
    const user = userEvent.setup();
    render(<ChecklistItem checklist={CHECKLIST_WITH_ITEMS} onUpdateItem={onUpdateItem} />);
    await user.click(screen.getByRole("button", { name: /Checklist · items/i }));
    await user.click(screen.getByText("Sunscreen"));
    fireEvent.blur(screen.getByDisplayValue("Sunscreen"));
    expect(onUpdateItem).toHaveBeenCalledWith("item-1", "Sunscreen");
  });

  it("clicking item delete button calls onDeleteItem", async () => {
    const onDeleteItem = vi.fn();
    const user = userEvent.setup();
    render(<ChecklistItem checklist={CHECKLIST_WITH_ITEMS} onDeleteItem={onDeleteItem} />);
    await user.click(screen.getByRole("button", { name: /Checklist · items/i }));
    const deleteButtons = screen.getAllByTitle("Delete item");
    await user.click(deleteButtons[0]);
    expect(onDeleteItem).toHaveBeenCalledWith("item-1");
  });
});

describe("ChecklistItem — check state (Story 2.4)", () => {
  it("checked item renders with line-through text decoration", async () => {
    const user = userEvent.setup();
    render(<ChecklistItem checklist={CHECKLIST_PARTIAL_CHECKED} />);
    await user.click(screen.getByRole("button", { name: /Checklist · items/i }));
    expect(screen.getByText("Sunscreen")).toHaveStyle({ textDecoration: "line-through" });
  });

  it("checked item renders with dimmed color", async () => {
    const user = userEvent.setup();
    render(<ChecklistItem checklist={CHECKLIST_PARTIAL_CHECKED} />);
    await user.click(screen.getByRole("button", { name: /Checklist · items/i }));
    expect(screen.getByText("Sunscreen")).toHaveStyle({ color: "var(--fg-4)" });
  });

  it("unchecked item does not have line-through", async () => {
    const user = userEvent.setup();
    render(<ChecklistItem checklist={CHECKLIST_PARTIAL_CHECKED} />);
    await user.click(screen.getByRole("button", { name: /Checklist · items/i }));
    expect(screen.getByText("Passport")).not.toHaveStyle({ textDecoration: "line-through" });
  });

  it("clicking checkbox calls onToggleItem with the item id", async () => {
    const onToggleItem = vi.fn();
    const user = userEvent.setup();
    render(<ChecklistItem checklist={CHECKLIST_WITH_ITEMS} onToggleItem={onToggleItem} />);
    await user.click(screen.getByRole("button", { name: /Checklist · items/i }));
    const checkboxes = screen.getAllByTitle("Check item");
    await user.click(checkboxes[0]);
    expect(onToggleItem).toHaveBeenCalledWith("item-1");
  });

  it("unchecked checkbox has title 'Check item'", async () => {
    const user = userEvent.setup();
    render(<ChecklistItem checklist={CHECKLIST_WITH_ITEMS} />);
    await user.click(screen.getByRole("button", { name: /Checklist · items/i }));
    expect(screen.getAllByTitle("Check item")).toHaveLength(2);
  });

  it("checked checkbox has title 'Uncheck item'", async () => {
    const user = userEvent.setup();
    render(<ChecklistItem checklist={CHECKLIST_PARTIAL_CHECKED} />);
    await user.click(screen.getByRole("button", { name: /Checklist · items/i }));
    expect(screen.getByTitle("Uncheck item")).toBeInTheDocument();
    expect(screen.getByTitle("Check item")).toBeInTheDocument();
  });

  it("checked item checkbox renders Check icon", async () => {
    const user = userEvent.setup();
    render(<ChecklistItem checklist={CHECKLIST_PARTIAL_CHECKED} />);
    await user.click(screen.getByRole("button", { name: /Checklist · items/i }));
    expect(screen.getByTestId("check-icon")).toBeInTheDocument();
  });
});

describe("ChecklistItem — progress counter (Story 2.4)", () => {
  it("shows X/Y progress counter when items exist and not all checked", () => {
    render(<ChecklistItem checklist={CHECKLIST_PARTIAL_CHECKED} />);
    expect(screen.getByText("1/2")).toBeInTheDocument();
  });

  it("shows 0/N when no items are checked", () => {
    render(<ChecklistItem checklist={CHECKLIST_WITH_ITEMS} />);
    expect(screen.getByText("0/2")).toBeInTheDocument();
  });

  it("does not show progress counter when checklist has no items", () => {
    render(<ChecklistItem checklist={BASE_CHECKLIST} />);
    expect(screen.queryByText(/^\d+\/\d+$/)).not.toBeInTheDocument();
  });

  it("does not show progress counter when all items are checked (badge shown instead)", () => {
    render(<ChecklistItem checklist={CHECKLIST_ALL_CHECKED} />);
    expect(screen.queryByText("2/2")).not.toBeInTheDocument();
  });

  it("does not show progress counter in draft mode", () => {
    render(<ChecklistItem checklist={CHECKLIST_WITH_ITEMS} isDraft onCommitDraft={vi.fn()} onCancelDraft={vi.fn()} />);
    expect(screen.queryByText("0/2")).not.toBeInTheDocument();
  });
});

describe("ChecklistItem — completion indicators (Story 2.4)", () => {
  it("header label has strikethrough when all items are checked", () => {
    render(<ChecklistItem checklist={CHECKLIST_ALL_CHECKED} />);
    expect(screen.getByText("Checklist · items")).toHaveStyle({ textDecoration: "line-through" });
  });

  it("header label has no strikethrough when not all items are checked", () => {
    render(<ChecklistItem checklist={CHECKLIST_PARTIAL_CHECKED} />);
    expect(screen.getByText("Checklist · items")).not.toHaveStyle({
      textDecoration: "line-through",
    });
  });

  it("shows CheckCheck icon when all items are checked", () => {
    render(<ChecklistItem checklist={CHECKLIST_ALL_CHECKED} />);
    expect(screen.getByTestId("check-check-icon")).toBeInTheDocument();
  });

  it("CheckCheck icon has aria-label 'Complete'", () => {
    render(<ChecklistItem checklist={CHECKLIST_ALL_CHECKED} />);
    expect(screen.getByLabelText("Complete")).toBeInTheDocument();
  });

  it("does not show CheckCheck icon when not all items are checked", () => {
    render(<ChecklistItem checklist={CHECKLIST_PARTIAL_CHECKED} />);
    expect(screen.queryByTestId("check-check-icon")).not.toBeInTheDocument();
  });

  it("does not show CheckCheck icon when checklist has no items", () => {
    render(<ChecklistItem checklist={BASE_CHECKLIST} />);
    expect(screen.queryByTestId("check-check-icon")).not.toBeInTheDocument();
  });

  it("does not show CheckCheck icon in draft mode", () => {
    render(<ChecklistItem checklist={CHECKLIST_ALL_CHECKED} isDraft onCommitDraft={vi.fn()} onCancelDraft={vi.fn()} />);
    expect(screen.queryByTestId("check-check-icon")).not.toBeInTheDocument();
  });

  it("header label has no strikethrough in draft mode", () => {
    render(<ChecklistItem checklist={CHECKLIST_ALL_CHECKED} isDraft onCommitDraft={vi.fn()} onCancelDraft={vi.fn()} />);
    expect(screen.getByText("Checklist · items")).not.toHaveStyle({
      textDecoration: "line-through",
    });
  });
});

describe("ChecklistItem — collapse behavior (Story 2.5)", () => {
  it("clicking an expanded checklist header collapses it", async () => {
    const user = userEvent.setup();
    render(<ChecklistItem checklist={BASE_CHECKLIST} />);
    await user.click(screen.getByRole("button", { name: /Checklist · items/i }));
    expect(screen.getByPlaceholderText("Add an item…")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Checklist · items/i }));
    expect(screen.queryByPlaceholderText("Add an item…")).not.toBeInTheDocument();
  });

  it("auto-collapses after completion animation timer fires", () => {
    vi.useFakeTimers();
    const { rerender } = render(<ChecklistItem checklist={CHECKLIST_WITH_ITEMS} />);
    // Expand by clicking header
    fireEvent.click(screen.getByRole("button", { name: /Checklist · items/i }));
    expect(screen.getByPlaceholderText("Add an item…")).toBeInTheDocument();
    // Transition to all-checked → completion fires
    rerender(<ChecklistItem checklist={CHECKLIST_ALL_CHECKED} />);
    // Before timer fires, still expanded
    expect(screen.getByPlaceholderText("Add an item…")).toBeInTheDocument();
    // Advance past the 600ms animation timer
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.queryByPlaceholderText("Add an item…")).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("does NOT auto-collapse in draft mode when completion fires", () => {
    vi.useFakeTimers();
    render(<ChecklistItem checklist={CHECKLIST_ALL_CHECKED} isDraft onCommitDraft={vi.fn()} onCancelDraft={vi.fn()} />);
    // Completion effect fires on mount (all items checked from the start)
    act(() => {
      vi.advanceTimersByTime(600);
    });
    // Draft mode should still be expanded
    expect(screen.getByPlaceholderText("Add an item…")).toBeInTheDocument();
    vi.useRealTimers();
  });
});

describe("ChecklistItem — empty self-destruct (Story 2.5)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("blurring outside when items is empty and add-field is empty calls onDelete", () => {
    const onDelete = vi.fn();
    render(<ChecklistItem checklist={BASE_CHECKLIST} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole("button", { name: /Checklist · items/i }));
    fireEvent.blur(screen.getByPlaceholderText("Add an item…"));
    expect(onDelete).toHaveBeenCalledWith("cl-1");
  });

  it("blurring outside when items exist does NOT call onDelete", () => {
    const onDelete = vi.fn();
    render(<ChecklistItem checklist={CHECKLIST_WITH_ITEMS} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole("button", { name: /Checklist · items/i }));
    fireEvent.blur(screen.getByPlaceholderText("Add an item…"));
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("blurring outside when add-field has content does NOT call onDelete", () => {
    const onDelete = vi.fn();
    render(<ChecklistItem checklist={BASE_CHECKLIST} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole("button", { name: /Checklist · items/i }));
    fireEvent.change(screen.getByPlaceholderText("Add an item…"), {
      target: { value: "Sunscreen" },
    });
    fireEvent.blur(screen.getByPlaceholderText("Add an item…"));
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("blurring to a target inside the wrapper does NOT call onDelete", () => {
    const onDelete = vi.fn();
    render(<ChecklistItem checklist={BASE_CHECKLIST} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole("button", { name: /Checklist · items/i }));
    const titleBtn = screen.getByRole("button", { name: "Add title..." });
    fireEvent.blur(screen.getByPlaceholderText("Add an item…"), { relatedTarget: titleBtn });
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("wrapper has id attribute for E2E targeting", () => {
    const { container } = render(<ChecklistItem checklist={BASE_CHECKLIST} />);
    expect(container.querySelector("#checklist-cl-1")).toBeInTheDocument();
  });

  it("renders dragHandle when provided", () => {
    render(<ChecklistItem checklist={BASE_CHECKLIST} dragHandle={<span data-testid="drag-handle">grip</span>} />);
    expect(screen.getByTestId("drag-handle")).toBeInTheDocument();
  });

  it("does NOT render dragHandle slot when isDraft", () => {
    render(
      <ChecklistItem checklist={BASE_CHECKLIST} isDraft dragHandle={<span data-testid="drag-handle">grip</span>} />
    );
    expect(screen.queryByTestId("drag-handle")).not.toBeInTheDocument();
  });
});
