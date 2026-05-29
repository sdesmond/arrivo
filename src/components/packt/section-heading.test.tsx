import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SectionHeading } from "./section-heading";

describe("SectionHeading", () => {
  it("renders children", () => {
    render(<SectionHeading>Workspace</SectionHeading>);
    expect(screen.getByText("Workspace")).toBeInTheDocument();
  });

  it("renders string children", () => {
    render(<SectionHeading>Account</SectionHeading>);
    expect(screen.getByText("Account")).toBeInTheDocument();
  });
});
