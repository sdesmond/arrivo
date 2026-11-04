import { describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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

  it("shows a member's photo instead of initials, others keep initials", () => {
    const { container } = render(
      <AvatarStack initials={["AB", "CD"]} images={["/api/storage/user-avatars/u1/a.webp", null]} />
    );

    const photos = container.querySelectorAll("img");
    expect(photos).toHaveLength(1);
    expect(photos[0]).toHaveAttribute("src", "/api/storage/user-avatars/u1/a.webp");
    expect(photos[0]).toHaveAttribute("alt", "");
    expect(screen.queryByText("AB")).not.toBeInTheDocument();
    expect(screen.getByText("CD")).toBeInTheDocument();
  });

  it("falls back to initials when a member's photo fails to load", () => {
    const { container } = render(<AvatarStack initials={["AB"]} images={["/api/storage/user-avatars/u1/a.webp"]} />);

    fireEvent.error(container.querySelector("img")!);

    expect(screen.getByText("AB")).toBeInTheDocument();
  });

  it("keeps the aria-label as the names even when photos show", () => {
    render(
      <AvatarStack initials={["AB", "CD"]} images={["/api/storage/user-avatars/u1/a.webp"]} aria-label="Ann, Cy" />
    );
    expect(screen.getByLabelText("Ann, Cy")).toBeInTheDocument();
  });

  it("only uses photos for the visible members and still counts the overflow", () => {
    const { container } = render(
      <AvatarStack initials={["AB", "CD", "EF"]} images={[null, null, "/api/storage/user-avatars/u3/a.webp"]} max={2} />
    );

    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(screen.getByText("+1")).toBeInTheDocument();
  });
});
