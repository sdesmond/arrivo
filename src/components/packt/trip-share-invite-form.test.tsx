import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CollaboratorRole } from "@/data/types";
import { TripShareInviteForm } from "./trip-share-invite-form";

describe("TripShareInviteForm", () => {
  it("forwards email changes and invite clicks", () => {
    const onEmailChange = vi.fn();
    const onInvite = vi.fn();

    render(
      <TripShareInviteForm
        email=""
        error={null}
        isLoading={false}
        onEmailChange={onEmailChange}
        onInvite={onInvite}
        onRoleChange={vi.fn()}
        role={CollaboratorRole.Viewer}
      />
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Invite email" }), { target: { value: "guest@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));

    expect(onEmailChange).toHaveBeenCalledWith("guest@example.com");
    expect(onInvite).toHaveBeenCalledOnce();
  });

  it("disables controls and announces its inline error while inviting", () => {
    render(
      <TripShareInviteForm
        email="guest@example.com"
        error="No Packt account found for this email."
        isLoading
        onEmailChange={vi.fn()}
        onInvite={vi.fn()}
        onRoleChange={vi.fn()}
        role={CollaboratorRole.Viewer}
      />
    );

    expect(screen.getByRole("textbox", { name: "Invite email" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Invite email" })).toHaveAttribute(
      "aria-describedby",
      "invite-email-error"
    );
    expect(screen.getByTitle("Invite this person to the trip")).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("No Packt account found for this email.");
    expect(screen.getByLabelText("Sending invitation")).toBeInTheDocument();
  });

  it("supports external disabling without showing invite progress", () => {
    render(
      <TripShareInviteForm
        disabled
        email="guest@example.com"
        error={null}
        isLoading={false}
        onEmailChange={vi.fn()}
        onInvite={vi.fn()}
        onRoleChange={vi.fn()}
        role={CollaboratorRole.Viewer}
      />
    );

    expect(screen.getByRole("textbox", { name: "Invite email" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Invite role" })).toBeDisabled();
    expect(screen.getByTitle("Invite this person to the trip")).toBeDisabled();
    expect(screen.queryByLabelText("Sending invitation")).not.toBeInTheDocument();
  });
});
