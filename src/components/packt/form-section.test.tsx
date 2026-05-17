// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Section, Field } from "./form-section";

describe("Section", () => {
  it("renders the section title", () => {
    render(<Section title="Identity">content</Section>);
    expect(screen.getByText("Identity")).toBeInTheDocument();
  });

  it("renders children", () => {
    render(<Section title="Test">child content</Section>);
    expect(screen.getByText("child content")).toBeInTheDocument();
  });
});

describe("Field", () => {
  it("renders the label text as a span when no htmlFor", () => {
    render(<Field label="Name">input</Field>);
    const label = screen.getByText("Name");
    expect(label.tagName).toBe("SPAN");
  });

  it("renders the label as a label element when htmlFor is provided", () => {
    render(
      <Field label="Email" htmlFor="email-input">
        <input id="email-input" />
      </Field>
    );
    const label = screen.getByText("Email");
    expect(label.tagName).toBe("LABEL");
    expect(label).toHaveAttribute("for", "email-input");
  });

  it("associates label with input via htmlFor", () => {
    render(
      <Field label="Password" htmlFor="pw">
        <input id="pw" type="password" />
      </Field>
    );
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  it("renders children", () => {
    render(<Field label="Notes">child</Field>);
    expect(screen.getByText("child")).toBeInTheDocument();
  });
});
