import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CollaboratorRole } from "@/data/types";
import type { InvitableUser } from "@/data/types";
import { TripShareInviteForm } from "./trip-share-invite-form";

const alice: InvitableUser = { id: "user-alice", username: "alice" };
const bob: InvitableUser = { id: "user-bob", username: "bob" };

type FormProps = Parameters<typeof TripShareInviteForm>[0];

function renderForm(overrides: Partial<FormProps> = {}) {
  const props: FormProps = {
    error: null,
    hasOtherUsers: true,
    isLoading: false,
    onInvite: vi.fn(),
    onRoleChange: vi.fn(),
    onUserChange: vi.fn(),
    role: CollaboratorRole.Viewer,
    selectedUser: null,
    users: [alice, bob],
    usersLoaded: true,
    ...overrides,
  };
  render(<TripShareInviteForm {...props} />);
  return props;
}

function getInput(): HTMLElement {
  return screen.getByRole("combobox", { name: "Invite username" });
}

describe("TripShareInviteForm", () => {
  it("lists registered usernames and reports the picked user", async () => {
    const user = userEvent.setup();
    const props = renderForm();

    await user.click(getInput());
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["alice", "bob"]);
    await user.click(screen.getByRole("option", { name: "alice" }));

    expect(props.onUserChange).toHaveBeenCalledWith(alice);
  });

  it("filters the options as the person types", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(getInput());
    await user.type(getInput(), "BO");

    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["bob"]);
  });

  it("selects with the keyboard and leaves focus on the input", async () => {
    const user = userEvent.setup();
    const props = renderForm();

    await user.click(getInput());
    await user.keyboard("{ArrowDown}{Enter}");

    expect(props.onUserChange).toHaveBeenCalledWith(alice);
    expect(getInput()).toHaveFocus();
  });

  it("closes only the popup on Escape and keeps focus on the input", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(getInput());
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(getInput()).toHaveFocus();
  });

  it("does not clear the pick when it is made from the list", async () => {
    const user = userEvent.setup();
    const props = renderForm();

    await user.click(getInput());
    await user.click(screen.getByRole("option", { name: "alice" }));

    expect(props.onUserChange).not.toHaveBeenCalledWith(null);
  });

  it("drops the pick when the text is edited away from it, keeping what was typed", async () => {
    const user = userEvent.setup();

    function Harness() {
      const [selectedUser, setSelectedUser] = useState<InvitableUser | null>(null);
      return (
        <TripShareInviteForm
          error={null}
          hasOtherUsers
          isLoading={false}
          onInvite={vi.fn()}
          onRoleChange={vi.fn()}
          onUserChange={setSelectedUser}
          role={CollaboratorRole.Viewer}
          selectedUser={selectedUser}
          users={[alice, bob]}
          usersLoaded
        />
      );
    }
    render(<Harness />);

    await user.click(getInput());
    await user.click(screen.getByRole("option", { name: "alice" }));
    expect(screen.getByTitle("Invite this person to the trip")).toBeEnabled();
    await user.type(getInput(), "x");

    expect(getInput()).toHaveValue("alicex");
    expect(screen.getByTitle("Invite this person to the trip")).toBeDisabled();
  });

  it("gives every option a 44px target", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(getInput());

    for (const option of screen.getAllByRole("option")) expect(option).toHaveClass("h-11");
  });

  it("announces when nothing matches and keeps Invite disabled", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(getInput());
    await user.type(getInput(), "zzz");

    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("No registered users found");
    expect(screen.getByTitle("Invite this person to the trip")).toBeDisabled();
  });

  it("enables Invite once a user is selected and forwards the click", async () => {
    const user = userEvent.setup();
    const props = renderForm({ selectedUser: alice });

    expect(getInput()).toHaveValue("alice");
    await user.click(screen.getByTitle("Invite this person to the trip"));

    expect(props.onInvite).toHaveBeenCalledOnce();
  });

  it("disables Invite without a selection", () => {
    renderForm();

    expect(screen.getByTitle("Invite this person to the trip")).toBeDisabled();
  });

  it("points a sole user at the Users screen and disables the picker", () => {
    renderForm({ hasOtherUsers: false, users: [] });

    expect(getInput()).toBeDisabled();
    const link = screen.getByRole("link", { name: "Users screen" });
    expect(link).toHaveAttribute("href", "/admin/users");
    expect(link).toHaveClass("min-h-11");
    expect(link.closest("p")).toHaveTextContent("You are the only user, you can add more from the Users screen.");
    expect(getInput()).toHaveAttribute("aria-describedby", link.closest("p")?.id);
  });

  it("says no one is available when every other account is already involved", () => {
    renderForm({ hasOtherUsers: true, users: [] });

    expect(getInput()).toBeDisabled();
    expect(screen.getByText("No registered users available to invite.")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("holds the picker back until the users have loaded, without any empty-state message", () => {
    renderForm({ hasOtherUsers: false, usersLoaded: false, users: [] });

    expect(getInput()).toBeDisabled();
    expect(screen.queryByText(/only user/)).not.toBeInTheDocument();
    expect(screen.queryByText(/No registered users available/)).not.toBeInTheDocument();
  });

  it("disables controls and announces its inline error while inviting", () => {
    renderForm({ error: "No account found for this username.", isLoading: true, selectedUser: alice });

    expect(getInput()).toBeDisabled();
    expect(getInput()).toHaveAttribute("aria-describedby", "invite-username-error");
    expect(screen.getByTitle("Invite this person to the trip")).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("No account found for this username.");
    expect(screen.getByLabelText("Sending invitation")).toBeInTheDocument();
  });

  it("supports external disabling without showing invite progress", () => {
    renderForm({ disabled: true, selectedUser: alice });

    expect(getInput()).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Invite role" })).toBeDisabled();
    expect(screen.getByTitle("Invite this person to the trip")).toBeDisabled();
    expect(screen.queryByLabelText("Sending invitation")).not.toBeInTheDocument();
  });

  it("clears the picker's text when the selection is cleared", () => {
    const props: FormProps = {
      error: null,
      hasOtherUsers: true,
      isLoading: false,
      onInvite: vi.fn(),
      onRoleChange: vi.fn(),
      onUserChange: vi.fn(),
      role: CollaboratorRole.Viewer,
      selectedUser: alice,
      users: [alice, bob],
      usersLoaded: true,
    };
    const { rerender } = render(<TripShareInviteForm {...props} />);
    expect(getInput()).toHaveValue("alice");

    rerender(<TripShareInviteForm {...props} selectedUser={null} />);

    expect(getInput()).toHaveValue("");
  });
});
