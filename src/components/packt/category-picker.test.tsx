import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CategoryPicker } from "./category-picker";
import { ExpenseCategory } from "@/data/types";

describe("CategoryPicker", () => {
  it("opens on click and lists all categories", async () => {
    const user = userEvent.setup();
    render(<CategoryPicker onChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /select category/i }));

    expect(screen.getAllByRole("option")).toHaveLength(11);
    expect(screen.getByRole("option", { name: "Food" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Car Rental" })).toBeInTheDocument();
  });

  it("opens on Enter, selects a category, and returns focus to trigger", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CategoryPicker value={ExpenseCategory.Food} onChange={onChange} />);

    const trigger = screen.getByRole("button", { name: "Food" });
    trigger.focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByRole("option", { name: "Food" })).toHaveFocus());
    await user.keyboard("{ArrowDown}{Enter}");

    expect(onChange).toHaveBeenCalledWith(ExpenseCategory.Lodging);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Food" })).toHaveFocus());
  });

  it("closes on Escape without changing selection", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CategoryPicker onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /select category/i }));
    await user.keyboard("{Escape}");

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("shows selected option highlight state", async () => {
    const user = userEvent.setup();
    render(<CategoryPicker value={ExpenseCategory.Shopping} onChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Shopping" }));

    expect(screen.getByRole("option", { name: "Shopping" })).toHaveAttribute("aria-selected", "true");
  });

  it("wraps upward, supports home and end, and closes on Tab", async () => {
    const user = userEvent.setup();
    render(<CategoryPicker value={ExpenseCategory.Food} onChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Food" }));
    await waitFor(() => expect(screen.getByRole("option", { name: "Food" })).toHaveFocus());

    await user.keyboard("{ArrowUp}");
    await waitFor(() => expect(screen.getByRole("option", { name: "Misc" })).toHaveFocus());

    await user.keyboard("{Home}");
    await waitFor(() => expect(screen.getByRole("option", { name: "Food" })).toHaveFocus());

    await user.keyboard("{End}");
    await waitFor(() => expect(screen.getByRole("option", { name: "Misc" })).toHaveFocus());

    await user.keyboard("{Tab}");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("does not open when disabled and returns focus on outside click", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <div>
        <CategoryPicker disabled onChange={vi.fn()} />
        <button type="button">Outside</button>
      </div>
    );

    const disabledTrigger = screen.getByRole("button", { name: /select category/i });
    fireEvent.keyDown(disabledTrigger, { key: "Enter" });

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    rerender(
      <div>
        <CategoryPicker onChange={vi.fn()} />
        <button type="button">Outside</button>
      </div>
    );

    const trigger = screen.getByRole("button", { name: /select category/i });
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Outside" }));

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("opens from ArrowUp, toggles closed from the trigger, and ignores unrelated trigger keys", async () => {
    const user = userEvent.setup();
    render(<CategoryPicker onChange={vi.fn()} />);

    const trigger = screen.getByRole("button", { name: /select category/i });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "A" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    await user.keyboard("{ArrowUp}");

    expect(screen.getByRole("listbox")).toBeInTheDocument();

    await user.keyboard("{a}");
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    await user.click(trigger);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("wraps forward from the last option back to the first and ignores Escape while closed", async () => {
    const user = userEvent.setup();
    render(<CategoryPicker value={ExpenseCategory.Food} onChange={vi.fn()} />);

    const trigger = screen.getByRole("button", { name: "Food" });
    trigger.focus();
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    await user.click(trigger);
    await waitFor(() => expect(screen.getByRole("option", { name: "Food" })).toHaveFocus());
    await user.keyboard("{End}");
    await waitFor(() => expect(screen.getByRole("option", { name: "Misc" })).toHaveFocus());
    await user.keyboard("{ArrowDown}");
    await waitFor(() => expect(screen.getByRole("option", { name: "Food" })).toHaveFocus());
  });

  it("closes from option Escape and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    render(<CategoryPicker value={ExpenseCategory.Food} onChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Food" }));
    const option = screen.getByRole("option", { name: "Food" });
    await waitFor(() => expect(option).toHaveFocus());

    fireEvent.keyDown(option, { key: "Escape" });

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Food" })).toHaveFocus());
  });

  it("uses a fixed-height scroll area so all categories remain reachable by scrolling", async () => {
    // `max-h-*` alone leaves the inner viewport's `height: 100%` unresolved (no definite
    // parent height), so the list silently clips instead of scrolling. Must stay `h-80`.
    const user = userEvent.setup();
    render(<CategoryPicker onChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /select category/i }));

    const scrollArea = document.querySelector('[data-slot="scroll-area"]');
    expect(scrollArea).toHaveClass("h-80");
    expect(scrollArea).not.toHaveClass("max-h-80");
  });

  it("marks the trigger aria-required when required", () => {
    render(<CategoryPicker onChange={vi.fn()} required />);

    expect(screen.getByRole("button", { name: /select category/i })).toHaveAttribute("aria-required", "true");
  });

  it("selects with Space and keeps the picker open for unrelated option keys", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CategoryPicker onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /select category/i }));
    const foodOption = screen.getByRole("option", { name: "Food" });
    await waitFor(() => expect(foodOption).toHaveFocus());

    await user.keyboard("a");
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    await user.keyboard(" ");

    expect(onChange).toHaveBeenCalledWith(ExpenseCategory.Food);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
