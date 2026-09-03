import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
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

describe("TripShareCollaboratorRow", () => {
  it("identifies the creator with an accessible lock", () => {
    render(<TripShareCollaboratorRow collaborator={creator} roleLabel={(role) => role} />);

    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByLabelText("Trip creator — access can't be changed")).toBeInTheDocument();
  });

  it("renders a text role for a non-creator", () => {
    render(
      <TripShareCollaboratorRow
        collaborator={{ ...creator, isCreator: false, role: "editor" }}
        roleLabel={(role) => role.charAt(0).toUpperCase() + role.slice(1)}
      />
    );

    expect(screen.getByText("Editor")).toBeInTheDocument();
    expect(screen.queryByLabelText("Trip creator — access can't be changed")).not.toBeInTheDocument();
  });
});
