import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReservationInlineTextField } from "./reservation-inline-text-field";

const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => toastError(...args) },
}));

describe("ReservationInlineTextField", () => {
  it("renders the value when non-empty", () => {
    render(
      <ReservationInlineTextField value="Acme Air" placeholder="Add provider" ariaLabel="Provider" onSave={vi.fn()} />
    );

    expect(screen.getByRole("button", { name: "Acme Air" })).toBeInTheDocument();
  });

  it("renders the placeholder, muted, when the value is empty", () => {
    render(<ReservationInlineTextField value="" placeholder="Add notes" ariaLabel="Notes" onSave={vi.fn()} />);

    const button = screen.getByRole("button", { name: "Add notes" });
    expect(button).toBeInTheDocument();
    expect(button).toHaveStyle({ fontStyle: "italic" });
  });

  it("enters edit mode on click, showing an input with the current value", async () => {
    const user = userEvent.setup();
    render(
      <ReservationInlineTextField value="Acme Air" placeholder="Add provider" ariaLabel="Provider" onSave={vi.fn()} />
    );

    await user.click(screen.getByRole("button", { name: "Acme Air" }));

    const input = screen.getByRole("textbox", { name: "Provider" });
    expect(input).toHaveValue("Acme Air");
  });

  it("saves on Enter for single-line fields", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <ReservationInlineTextField value="Acme Air" placeholder="Add provider" ariaLabel="Provider" onSave={onSave} />
    );

    await user.click(screen.getByRole("button", { name: "Acme Air" }));
    const input = screen.getByRole("textbox", { name: "Provider" });
    await user.clear(input);
    await user.type(input, "New Air");
    await user.keyboard("{Enter}");

    expect(onSave).toHaveBeenCalledWith("New Air");
    expect(screen.queryByRole("textbox", { name: "Provider" })).not.toBeInTheDocument();
  });

  it("saves on blur", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <div>
        <ReservationInlineTextField value="Acme Air" placeholder="Add provider" ariaLabel="Provider" onSave={onSave} />
        <button type="button">Elsewhere</button>
      </div>
    );

    await user.click(screen.getByRole("button", { name: "Acme Air" }));
    const input = screen.getByRole("textbox", { name: "Provider" });
    await user.clear(input);
    await user.type(input, "New Air");
    await user.click(screen.getByRole("button", { name: "Elsewhere" }));

    expect(onSave).toHaveBeenCalledWith("New Air");
  });

  it("cancels on Escape without calling onSave and returns focus to the display button", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <ReservationInlineTextField value="Acme Air" placeholder="Add provider" ariaLabel="Provider" onSave={onSave} />
    );

    await user.click(screen.getByRole("button", { name: "Acme Air" }));
    const input = screen.getByRole("textbox", { name: "Provider" });
    await user.clear(input);
    await user.type(input, "New Air");
    await user.keyboard("{Escape}");

    expect(onSave).not.toHaveBeenCalled();
    const displayButton = screen.getByRole("button", { name: "Acme Air" });
    expect(displayButton).toHaveFocus();
  });

  it("renders a textarea without Enter-save in multiline mode", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <ReservationInlineTextField
        value="Some notes"
        placeholder="Add notes"
        ariaLabel="Notes"
        multiline
        onSave={onSave}
      />
    );

    await user.click(screen.getByRole("button", { name: "Some notes" }));
    const textarea = screen.getByRole("textbox", { name: "Notes" });
    expect(textarea.tagName).toBe("TEXTAREA");

    await user.type(textarea, "{enter}more text");

    expect(onSave).not.toHaveBeenCalled();
    expect(textarea).toHaveValue("Some notes\nmore text");
  });

  it("shows a toast error and stays in edit mode with the draft preserved when onSave rejects", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("Provider is required."));
    const user = userEvent.setup();
    render(
      <ReservationInlineTextField value="Acme Air" placeholder="Add provider" ariaLabel="Provider" onSave={onSave} />
    );

    await user.click(screen.getByRole("button", { name: "Acme Air" }));
    const input = screen.getByRole("textbox", { name: "Provider" });
    await user.clear(input);
    await user.type(input, "   ");
    await user.keyboard("{Enter}");

    expect(toastError).toHaveBeenCalledWith("Provider is required.");
    expect(screen.getByRole("textbox", { name: "Provider" })).toHaveValue("   ");
  });
});
