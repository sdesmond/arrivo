import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AvatarStack } from "./avatar-stack";

describe("AvatarStack", () => {
  it("renders up to max avatars", () => {
    render(<AvatarStack initials={["AB", "CD", "EF", "GH", "IJ"]} max={3} />);
    expect(screen.getByText("AB")).toBeInTheDocument();
    expect(screen.getByText("CD")).toBeInTheDocument();
    expect(screen.getByText("EF")).toBeInTheDocument();
    expect(screen.queryByText("GH")).not.toBeInTheDocument();
    expect(screen.queryByText("IJ")).not.toBeInTheDocument();
  });

  it("shows +N overflow badge when initials exceed max", () => {
    render(<AvatarStack initials={["AB", "CD", "EF", "GH", "IJ"]} max={3} />);
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("shows no overflow badge when initials fit within max", () => {
    render(<AvatarStack initials={["AB", "CD"]} max={4} />);
    expect(screen.queryByText(/^\+\d+$/)).not.toBeInTheDocument();
  });

  it("uses explicit aria-label when provided", () => {
    render(<AvatarStack initials={["AB", "CD"]} aria-label="Trip collaborators" />);
    expect(screen.getByLabelText("Trip collaborators")).toBeInTheDocument();
  });

  it("falls back to joined initials as aria-label", () => {
    render(<AvatarStack initials={["AB", "CD"]} />);
    expect(screen.getByLabelText("AB, CD")).toBeInTheDocument();
  });

  it("renders all avatars when count equals max", () => {
    render(<AvatarStack initials={["AA", "BB", "CC"]} max={3} />);
    expect(screen.getByText("AA")).toBeInTheDocument();
    expect(screen.getByText("BB")).toBeInTheDocument();
    expect(screen.getByText("CC")).toBeInTheDocument();
    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();
  });

  it("renders with size md (larger dimensions)", () => {
    render(<AvatarStack initials={["AB"]} size="md" />);
    const container = screen.getByLabelText("AB");
    expect(container).toBeInTheDocument();
  });
});
