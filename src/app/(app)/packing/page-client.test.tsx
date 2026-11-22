import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PackingTemplate } from "@/data/types";

const { mockCreateMutate, mockDeleteTemplate, mockRenameTemplate, settings } = vi.hoisted(() => ({
  settings: { realHook: false },
  mockCreateMutate: vi.fn(),
  mockDeleteTemplate: vi.fn(),
  mockRenameTemplate: vi.fn(),
}));

vi.mock("@/lib/api/use-api-mutation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/use-api-mutation")>();
  return {
    useApiMutation: (endpoint: Parameters<typeof actual.useApiMutation>[0]) =>
      settings.realHook
        ? actual.useApiMutation(endpoint)
        : {
            mutate:
              endpoint.method === "POST"
                ? mockCreateMutate
                : endpoint.method === "PATCH"
                  ? mockRenameTemplate
                  : mockDeleteTemplate,
            isPending: false,
            fields: {},
          },
  };
});
vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

vi.mock("@/components/arrivo/template-library", () => ({
  TemplateLibrary: ({
    templates,
    onDelete,
    onNew,
    onRename,
  }: {
    templates: PackingTemplate[];
    onDelete: (template: PackingTemplate) => void;
    onNew: () => void;
    onRename: (template: PackingTemplate) => void;
  }) => (
    <div>
      <button onClick={onNew}>open-create</button>
      <button onClick={() => onRename(templates[0])}>open-rename</button>
      <button onClick={() => onDelete(templates[0])}>open-delete</button>
    </div>
  ),
}));

vi.mock("@/components/arrivo/template-form-dialog", () => ({
  TemplateFormDialog: ({
    mode,
    open,
    onOpenChange,
    onSubmit,
  }: {
    mode: "create" | "rename";
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (name: string) => void | Promise<void>;
  }) =>
    open ? (
      <div>
        <button onClick={() => void onSubmit(mode === "create" ? "Created Template" : "Renamed Template")}>
          submit-{mode}
        </button>
        {mode === "create" ? <button onClick={() => void onSubmit("Edited Template")}>submit-edited</button> : null}
        {mode === "create" ? <button onClick={() => void onSubmit("Created Template ")}>submit-padded</button> : null}
        <button onClick={() => onOpenChange(false)}>close-{mode}</button>
      </div>
    ) : null,
}));

vi.mock("@/components/arrivo/delete-template-alert-dialog", () => ({
  DeleteTemplateAlertDialog: ({
    open,
    onConfirm,
    onOpenChange,
  }: {
    open: boolean;
    onConfirm: () => void | Promise<void>;
    onOpenChange: (open: boolean) => void;
  }) =>
    open ? (
      <div>
        <button onClick={() => void onConfirm()}>confirm-delete</button>
        <button onClick={() => onOpenChange(false)}>close-delete</button>
      </div>
    ) : null,
}));

import { toast } from "sonner";
import { TemplatesPageClient } from "./page-client";

const templates: PackingTemplate[] = [{ id: "template-1", name: "Beach Weekend" }];

describe("TemplatesPageClient", () => {
  beforeEach(() => {
    settings.realHook = false;
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    mockCreateMutate.mockReset();
  });

  it("creates a template through the endpoint and closes the dialog on success", async () => {
    const user = userEvent.setup();
    mockCreateMutate.mockImplementationOnce(async (_input, options) => options.onSuccess({ id: "x" }));

    render(<TemplatesPageClient templates={templates} />);

    await user.click(screen.getByRole("button", { name: "open-create" }));
    await user.click(screen.getByRole("button", { name: "submit-create" }));

    expect(mockCreateMutate).toHaveBeenCalledWith(
      { params: {}, body: { id: expect.any(String), name: "Created Template" } },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
    expect(screen.queryByRole("button", { name: "submit-create" })).not.toBeInTheDocument();
  });

  it("keeps the id across a failed retry and mints a new one after a name edit", async () => {
    const user = userEvent.setup();
    mockCreateMutate.mockResolvedValue(undefined);

    render(<TemplatesPageClient templates={templates} />);

    await user.click(screen.getByRole("button", { name: "open-create" }));
    await user.click(screen.getByRole("button", { name: "submit-create" }));
    await user.click(screen.getByRole("button", { name: "submit-create" }));
    await user.click(screen.getByRole("button", { name: "submit-edited" }));

    const ids = mockCreateMutate.mock.calls.map((call) => call[0].body.id);
    expect(ids[0]).toBe(ids[1]);
    expect(ids[2]).not.toBe(ids[0]);
    expect(screen.getByRole("button", { name: "submit-create" })).toBeInTheDocument();
  });

  it("keeps the id when a retry differs only by surrounding whitespace", async () => {
    const user = userEvent.setup();
    mockCreateMutate.mockResolvedValue(undefined);

    render(<TemplatesPageClient templates={templates} />);

    await user.click(screen.getByRole("button", { name: "open-create" }));
    await user.click(screen.getByRole("button", { name: "submit-create" }));
    await user.click(screen.getByRole("button", { name: "submit-padded" }));

    const ids = mockCreateMutate.mock.calls.map((call) => call[0].body.id);
    expect(ids[1]).toBe(ids[0]);
  });

  it("uses a fresh id for the next create after a success", async () => {
    const user = userEvent.setup();
    mockCreateMutate.mockImplementation(async (_input, options) => options.onSuccess({ id: "x" }));

    render(<TemplatesPageClient templates={templates} />);

    await user.click(screen.getByRole("button", { name: "open-create" }));
    await user.click(screen.getByRole("button", { name: "submit-create" }));
    await user.click(screen.getByRole("button", { name: "open-create" }));
    await user.click(screen.getByRole("button", { name: "submit-create" }));

    const ids = mockCreateMutate.mock.calls.map((call) => call[0].body.id);
    expect(ids[1]).not.toBe(ids[0]);
  });

  it("renames a template and clears rename state on success", async () => {
    const user = userEvent.setup();
    mockRenameTemplate.mockImplementationOnce(async (_input, options) => options.onSuccess());

    render(<TemplatesPageClient templates={templates} />);

    await user.click(screen.getByRole("button", { name: "open-rename" }));
    await user.click(screen.getByRole("button", { name: "submit-rename" }));

    expect(mockRenameTemplate).toHaveBeenCalledWith(
      { params: { templateId: "template-1" }, body: { name: "Renamed Template" } },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
    expect(screen.queryByRole("button", { name: "submit-rename" })).not.toBeInTheDocument();
  });

  it("deletes a template and clears delete state on success", async () => {
    const user = userEvent.setup();
    mockDeleteTemplate.mockImplementationOnce(async (_input, options) => options.onSuccess());

    render(<TemplatesPageClient templates={templates} />);

    await user.click(screen.getByRole("button", { name: "open-delete" }));
    await user.click(screen.getByRole("button", { name: "confirm-delete" }));

    expect(mockDeleteTemplate).toHaveBeenCalledWith(
      { params: { templateId: "template-1" }, body: {} },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
    expect(screen.queryByRole("button", { name: "confirm-delete" })).not.toBeInTheDocument();
  });

  it("reports action failures with a toast and keeps the dialog open", async () => {
    const user = userEvent.setup();
    settings.realHook = true;
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ error: { code: "server_error", message: "Rename failed" } }, { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<TemplatesPageClient templates={templates} />);

    await user.click(screen.getByRole("button", { name: "open-rename" }));
    await user.click(screen.getByRole("button", { name: "submit-rename" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Rename failed"));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/packing-templates/template-1"),
      expect.objectContaining({ method: "PATCH" })
    );
    expect(screen.getByRole("button", { name: "submit-rename" })).toBeInTheDocument();
  });
});
