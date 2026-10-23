import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CollaboratorRole } from "@/data/types";
import { TripShareInviteForm } from "./trip-share-invite-form";

describe("TripShareInviteForm", () => {
  it("forwards username changes and invite clicks", () => {
    const onUsernameChange = vi.fn();
    const onInvite = vi.fn();

    render(
      <TripShareInviteForm
        username=""
        error={null}
        isLoading={false}
        onUsernameChange={onUsernameChange}
        onInvite={onInvite}
        onRoleChange={vi.fn()}
        role={CollaboratorRole.Viewer}
      />
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Invite username" }), { target: { value: "guest" } });
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));

    expect(onUsernameChange).toHaveBeenCalledWith("guest");
    expect(onInvite).toHaveBeenCalledOnce();
  });

  it("disables controls and announces its inline error while inviting", () => {
    render(
      <TripShareInviteForm
        username="guest"
        error="No account found for this username."
        isLoading
        onUsernameChange={vi.fn()}
        onInvite={vi.fn()}
        onRoleChange={vi.fn()}
        role={CollaboratorRole.Viewer}
      />
    );

    expect(screen.getByRole("textbox", { name: "Invite username" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Invite username" })).toHaveAttribute(
      "aria-describedby",
      "invite-username-error"
    );
    expect(screen.getByTitle("Invite this person to the trip")).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("No account found for this username.");
    expect(screen.getByLabelText("Sending invitation")).toBeInTheDocument();
  });

  it("supports external disabling without showing invite progress", () => {
    render(
      <TripShareInviteForm
        disabled
        username="guest"
        error={null}
        isLoading={false}
        onUsernameChange={vi.fn()}
        onInvite={vi.fn()}
        onRoleChange={vi.fn()}
        role={CollaboratorRole.Viewer}
      />
    );

    expect(screen.getByRole("textbox", { name: "Invite username" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Invite role" })).toBeDisabled();
    expect(screen.getByTitle("Invite this person to the trip")).toBeDisabled();
    expect(screen.queryByLabelText("Sending invitation")).not.toBeInTheDocument();
  });
});
