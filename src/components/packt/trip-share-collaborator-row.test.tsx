import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Collaborator } from "@/data/types";
import { TripShareCollaboratorRow } from "./trip-share-collaborator-row";

const creator: Collaborator = {
  id: "creator-1",
  email: "ada@example.com",
  initials: "AL",
  isCreator: true,
  name: "Ada Lovelace",
  role: "manager",
};

const editor: Collaborator = {
  id: "editor-1",
  email: "grace@example.com",
  initials: "GH",
  isCreator: false,
  name: "Grace Hopper",
  role: "editor",
};

const roleLabel = (role: string) => role.charAt(0).toUpperCase() + role.slice(1);

describe("TripShareCollaboratorRow", () => {
  it("identifies the creator with an accessible lock", () => {
    render(<TripShareCollaboratorRow collaborator={creator} roleLabel={(role) => role} />);

    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByLabelText("Trip creator — access can't be changed")).toBeInTheDocument();
  });

  it("does not offer a role selector or remove control on the creator row", () => {
    render(
      <TripShareCollaboratorRow
        collaborator={creator}
        onRemove={vi.fn()}
        onRoleChange={vi.fn()}
        roleLabel={roleLabel}
      />
    );

    expect(screen.queryByLabelText("Role for Ada Lovelace")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Remove Ada Lovelace")).not.toBeInTheDocument();
  });

  it("offers a titled remove control and a role selector for a non-creator", () => {
    render(
      <TripShareCollaboratorRow collaborator={editor} onRemove={vi.fn()} onRoleChange={vi.fn()} roleLabel={roleLabel} />
    );

    expect(screen.getByLabelText("Role for Grace Hopper")).toBeInTheDocument();
    expect(screen.getByLabelText("Role for Grace Hopper")).toHaveTextContent("Editor");
    expect(screen.getByLabelText("Role for Grace Hopper")).toHaveClass("h-11");
    expect(screen.getByTitle("Remove Grace Hopper")).toBeInTheDocument();
    expect(screen.getByTitle("Remove Grace Hopper")).toHaveClass("size-11");
  });

  it("shows all role options in the selector for a non-creator", async () => {
    const user = userEvent.setup();
    render(
      <TripShareCollaboratorRow collaborator={editor} onRemove={vi.fn()} onRoleChange={vi.fn()} roleLabel={roleLabel} />
    );

    await user.click(screen.getByLabelText("Role for Grace Hopper"));

    expect(await screen.findByRole("option", { name: "Manager" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Viewer" })).toBeInTheDocument();
  });

  it("reports a role change through the callback", async () => {
    const user = userEvent.setup();
    const onRoleChange = vi.fn();
    render(
      <TripShareCollaboratorRow
        collaborator={editor}
        onRemove={vi.fn()}
        onRoleChange={onRoleChange}
        roleLabel={roleLabel}
      />
    );

    await user.click(screen.getByLabelText("Role for Grace Hopper"));
    await user.click(await screen.findByRole("option", { name: "Viewer" }));

    expect(onRoleChange).toHaveBeenCalledWith(editor, "viewer");
  });

  it("reports a removal through the callback", () => {
    const onRemove = vi.fn();
    render(
      <TripShareCollaboratorRow
        collaborator={editor}
        onRemove={onRemove}
        onRoleChange={vi.fn()}
        roleLabel={roleLabel}
      />
    );

    fireEvent.click(screen.getByTitle("Remove Grace Hopper"));

    expect(onRemove).toHaveBeenCalledWith(editor);
  });

  it("disables the role selector and remove control when the row has a pending removal", () => {
    render(
      <TripShareCollaboratorRow
        collaborator={editor}
        disabled
        onRemove={vi.fn()}
        onRoleChange={vi.fn()}
        roleLabel={roleLabel}
      />
    );

    expect(screen.getByLabelText("Role for Grace Hopper")).toBeDisabled();
    expect(screen.getByTitle("Remove Grace Hopper")).toBeDisabled();
  });

  it("does not report a role change through the callback while disabled", async () => {
    const user = userEvent.setup();
    const onRoleChange = vi.fn();
    render(
      <TripShareCollaboratorRow
        collaborator={editor}
        disabled
        onRemove={vi.fn()}
        onRoleChange={onRoleChange}
        roleLabel={roleLabel}
      />
    );

    await user.click(screen.getByLabelText("Role for Grace Hopper"));

    expect(screen.queryByRole("option", { name: "Viewer" })).not.toBeInTheDocument();
    expect(onRoleChange).not.toHaveBeenCalled();
  });

  it("falls back to a static role badge when no callbacks are provided", () => {
    render(<TripShareCollaboratorRow collaborator={editor} roleLabel={roleLabel} />);

    expect(screen.getByText("Editor")).toBeInTheDocument();
    expect(screen.queryByLabelText("Role for Grace Hopper")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Remove Grace Hopper")).not.toBeInTheDocument();
  });
});
