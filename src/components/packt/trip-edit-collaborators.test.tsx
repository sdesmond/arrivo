import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TripEditCollaborators } from "./trip-edit-collaborators";
import type { Collaborator } from "@/data/types";

const collaborators: Collaborator[] = [
  {
    name: "Alice Smith",
    email: "alice@example.com",
    initials: "AS",
    role: "editor",
    tint: { bg: "#e0f2fe", fg: "#0369a1" },
  },
  {
    name: "Bob Jones",
    email: "bob@example.com",
    initials: "BJ",
    role: "viewer",
    tint: { bg: "#f0fdf4", fg: "#166534" },
  },
];

describe("TripEditCollaborators", () => {
  it("renders collaborator names and emails", () => {
    render(
      <TripEditCollaborators collaborators={collaborators} onRemove={vi.fn()} onUpdateRole={vi.fn()} onAdd={vi.fn()} />
    );
    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    expect(screen.getByText("Bob Jones")).toBeInTheDocument();
  });

  it("calls onRemove with index when remove button is clicked", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(
      <TripEditCollaborators collaborators={collaborators} onRemove={onRemove} onUpdateRole={vi.fn()} onAdd={vi.fn()} />
    );
    const removeButtons = screen.getAllByTitle(/^Remove /);
    await user.click(removeButtons[0]);
    expect(onRemove).toHaveBeenCalledWith(0);
  });

  it("calls onUpdateRole when role select changes", async () => {
    const user = userEvent.setup();
    const onUpdateRole = vi.fn();
    render(
      <TripEditCollaborators
        collaborators={collaborators}
        onRemove={vi.fn()}
        onUpdateRole={onUpdateRole}
        onAdd={vi.fn()}
      />
    );
    // Click the first role trigger (Alice = editor)
    const triggers = screen.getAllByRole("combobox");
    await user.click(triggers[0]);
    await user.click(await screen.findByRole("option", { name: /viewer/i }));
    expect(onUpdateRole).toHaveBeenCalledWith(0, "viewer");
  });

  it("calls onAdd when form is filled and Add is clicked", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<TripEditCollaborators collaborators={[]} onRemove={vi.fn()} onUpdateRole={vi.fn()} onAdd={onAdd} />);
    await user.type(screen.getByPlaceholderText("Name"), "Carol White");
    await user.type(screen.getByPlaceholderText("Email"), "carol@example.com");
    await user.click(screen.getByRole("button", { name: /add/i }));
    expect(onAdd).toHaveBeenCalledWith("Carol White", "carol@example.com", "editor");
  });

  it("renders 'No collaborators yet' when list is empty", () => {
    render(<TripEditCollaborators collaborators={[]} onRemove={vi.fn()} onUpdateRole={vi.fn()} onAdd={vi.fn()} />);
    expect(screen.getByText(/no collaborators yet/i)).toBeInTheDocument();
  });

  it("calls onAdd with viewer role when new role select is changed before adding", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<TripEditCollaborators collaborators={[]} onRemove={vi.fn()} onUpdateRole={vi.fn()} onAdd={onAdd} />);
    await user.type(screen.getByPlaceholderText("Name"), "Dana Blue");
    await user.type(screen.getByPlaceholderText("Email"), "dana@example.com");
    const triggers = screen.getAllByRole("combobox");
    const newRoleSelect = triggers[triggers.length - 1];
    await user.click(newRoleSelect);
    await user.click(await screen.findByRole("option", { name: /viewer/i }));
    await user.click(screen.getByRole("button", { name: /add/i }));
    expect(onAdd).toHaveBeenCalledWith("Dana Blue", "dana@example.com", "viewer");
  });

  it("a non-creator manager's row shows an enabled role dropdown and remove control", () => {
    const managerCollaborator: Collaborator[] = [
      { name: "Manager User", email: "manager@example.com", initials: "MU", role: "manager", isCreator: false },
    ];
    render(
      <TripEditCollaborators
        collaborators={managerCollaborator}
        onRemove={vi.fn()}
        onUpdateRole={vi.fn()}
        onAdd={vi.fn()}
      />
    );
    const trigger = screen.getByRole("combobox", { name: "Role for Manager User" });
    expect(trigger).not.toBeDisabled();
    expect(trigger).toHaveClass("h-11");
    const removeButton = screen.getByTitle("Remove Manager User");
    expect(removeButton).not.toBeDisabled();
    expect(screen.queryByTitle(/is the trip creator/i)).not.toBeInTheDocument();
  });

  it("a non-creator manager can be removed via the remove control", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    const managerCollaborator: Collaborator[] = [
      { name: "Manager User", email: "manager@example.com", initials: "MU", role: "manager", isCreator: false },
    ];
    render(
      <TripEditCollaborators
        collaborators={managerCollaborator}
        onRemove={onRemove}
        onUpdateRole={vi.fn()}
        onAdd={vi.fn()}
      />
    );
    await user.click(screen.getByTitle("Remove Manager User"));
    expect(onRemove).toHaveBeenCalledWith(0);
  });

  it("a non-creator manager can be demoted via the role dropdown", async () => {
    const user = userEvent.setup();
    const onUpdateRole = vi.fn();
    const managerCollaborator: Collaborator[] = [
      { name: "Manager User", email: "manager@example.com", initials: "MU", role: "manager", isCreator: false },
    ];
    render(
      <TripEditCollaborators
        collaborators={managerCollaborator}
        onRemove={vi.fn()}
        onUpdateRole={onUpdateRole}
        onAdd={vi.fn()}
      />
    );
    await user.click(screen.getByRole("combobox", { name: "Role for Manager User" }));
    await user.click(await screen.findByRole("option", { name: /viewer/i }));
    expect(onUpdateRole).toHaveBeenCalledWith(0, "viewer");
  });

  it("the creator's row shows a lock icon with no role dropdown and no remove control", () => {
    const creatorCollaborator: Collaborator[] = [
      { name: "Creator User", email: "creator@example.com", initials: "CU", role: "manager", isCreator: true },
    ];
    render(
      <TripEditCollaborators
        collaborators={creatorCollaborator}
        onRemove={vi.fn()}
        onUpdateRole={vi.fn()}
        onAdd={vi.fn()}
      />
    );
    expect(screen.getByTitle("Creator User is the trip creator")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Role for Creator User" })).not.toBeInTheDocument();
    expect(screen.queryByTitle("Remove Creator User")).not.toBeInTheDocument();
  });

  it("does not call onRemove or onUpdateRole for the creator's row (no controls to trigger them)", () => {
    const creatorCollaborator: Collaborator[] = [
      { name: "Creator User", email: "creator@example.com", initials: "CU", role: "manager", isCreator: true },
    ];
    const onRemove = vi.fn();
    const onUpdateRole = vi.fn();
    render(
      <TripEditCollaborators
        collaborators={creatorCollaborator}
        onRemove={onRemove}
        onUpdateRole={onUpdateRole}
        onAdd={vi.fn()}
      />
    );
    // Only the lock icon renders for the creator's row — no interactive control exists to click.
    expect(screen.getAllByRole("button")).toHaveLength(1); // just the "Add" button
    expect(onRemove).not.toHaveBeenCalled();
    expect(onUpdateRole).not.toHaveBeenCalled();
  });
});
