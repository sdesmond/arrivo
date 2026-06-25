import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { SaveAsTemplateDialog } from "./save-as-template-dialog";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const TEMPLATE_NAME_LABEL = "Template name";

describe("SaveAsTemplateDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders name input and save button when open", () => {
    render(<SaveAsTemplateDialog open={true} onClose={vi.fn()} onSave={vi.fn()} itemCount={3} />);

    expect(screen.getByLabelText(TEMPLATE_NAME_LABEL)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save template" })).toBeInTheDocument();
  });

  it("shows item count hint", () => {
    render(<SaveAsTemplateDialog open={true} onClose={vi.fn()} onSave={vi.fn()} itemCount={5} />);

    expect(screen.getByText("5 items will be saved")).toBeInTheDocument();
  });

  it("shows singular item count hint for one item", () => {
    render(<SaveAsTemplateDialog open={true} onClose={vi.fn()} onSave={vi.fn()} itemCount={1} />);

    expect(screen.getByText("1 item will be saved")).toBeInTheDocument();
  });

  it("save button is disabled when name is empty", () => {
    render(<SaveAsTemplateDialog open={true} onClose={vi.fn()} onSave={vi.fn()} itemCount={3} />);

    expect(screen.getByRole("button", { name: "Save template" })).toBeDisabled();
  });

  it("save button is enabled after typing a name", async () => {
    const user = userEvent.setup();
    render(<SaveAsTemplateDialog open={true} onClose={vi.fn()} onSave={vi.fn()} itemCount={3} />);

    await user.type(screen.getByLabelText(TEMPLATE_NAME_LABEL), "Beach Trip");
    expect(screen.getByRole("button", { name: "Save template" })).not.toBeDisabled();
  });

  it("shows inline validation error when form submitted with empty name", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(<SaveAsTemplateDialog open={true} onClose={vi.fn()} onSave={onSave} itemCount={3} />);

    await user.type(screen.getByLabelText(TEMPLATE_NAME_LABEL), "   ");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("calls onSave with trimmed name on valid submit", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue("tmpl-new");

    render(<SaveAsTemplateDialog open={true} onClose={vi.fn()} onSave={onSave} itemCount={3} />);

    await user.type(screen.getByLabelText(TEMPLATE_NAME_LABEL), "  Beach Trip  ");
    await user.click(screen.getByRole("button", { name: "Save template" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith("Beach Trip"));
  });

  it("shows success toast and calls onClose on successful save", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSave = vi.fn().mockResolvedValue("tmpl-new");

    render(<SaveAsTemplateDialog open={true} onClose={onClose} onSave={onSave} itemCount={3} />);

    await user.type(screen.getByLabelText(TEMPLATE_NAME_LABEL), "My Template");
    await user.click(screen.getByRole("button", { name: "Save template" }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Template saved");
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("shows inline error when onSave returns undefined (error path)", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(<SaveAsTemplateDialog open={true} onClose={onClose} onSave={onSave} itemCount={3} />);

    await user.type(screen.getByLabelText(TEMPLATE_NAME_LABEL), "My Template");
    await user.click(screen.getByRole("button", { name: "Save template" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Could not save template");
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("close button calls onClose", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<SaveAsTemplateDialog open={true} onClose={onClose} onSave={vi.fn()} itemCount={3} />);

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("cancel button calls onClose", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<SaveAsTemplateDialog open={true} onClose={onClose} onSave={vi.fn()} itemCount={3} />);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("closes when the dialog open state changes", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<SaveAsTemplateDialog open={true} onClose={onClose} onSave={vi.fn()} itemCount={3} />);

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("shows inline validation error when submitting empty name via Enter key", async () => {
    const user = userEvent.setup();
    render(<SaveAsTemplateDialog open={true} onClose={vi.fn()} onSave={vi.fn()} itemCount={3} />);

    const input = screen.getByLabelText(TEMPLATE_NAME_LABEL);
    await user.type(input, "{Enter}");

    expect(screen.getByRole("alert")).toHaveTextContent("Template name is required");
  });

  it("resets state when dialog reopens", () => {
    const { rerender } = render(<SaveAsTemplateDialog open={false} onClose={vi.fn()} onSave={vi.fn()} itemCount={3} />);

    rerender(<SaveAsTemplateDialog open={true} onClose={vi.fn()} onSave={vi.fn()} itemCount={3} />);

    expect(screen.getByLabelText(TEMPLATE_NAME_LABEL)).toHaveValue("");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save template" })).toBeDisabled();
  });

  it("clears the error when user types after a failed submission attempt", async () => {
    const user = userEvent.setup();
    render(<SaveAsTemplateDialog open={true} onClose={vi.fn()} onSave={vi.fn()} itemCount={3} />);

    await user.type(screen.getByLabelText(TEMPLATE_NAME_LABEL), "a");
    await user.clear(screen.getByLabelText(TEMPLATE_NAME_LABEL));
    await user.type(screen.getByLabelText(TEMPLATE_NAME_LABEL), "Valid Name");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
