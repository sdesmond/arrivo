// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
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

  it("does not render a title header when title is omitted", () => {
    const { container } = render(<Section>child content</Section>);
    expect(screen.getByText("child content")).toBeInTheDocument();
    // With no title, the Section root div should contain only the content wrapper
    const sectionRoot = container.firstChild as HTMLElement;
    expect(sectionRoot.children).toHaveLength(1);
  });
});

describe("Field", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it("renders <p role='status'> with error text when error and htmlFor are set", () => {
    render(
      <Field label="Name" htmlFor="name-input" error="Name is required.">
        <input id="name-input" />
      </Field>
    );
    const status = screen.getByRole("status");
    expect(status).toBeInTheDocument();
    expect(status).toHaveTextContent("Name is required.");
    expect(status).toHaveAttribute("id", "name-input-error");
  });

  it("does not render error when htmlFor is absent even if error is set", () => {
    render(
      <Field label="Notes" error="Some error">
        child
      </Field>
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("warns in development when error is set without htmlFor", () => {
    try {
      vi.stubEnv("NODE_ENV", "development");
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      render(
        <Field label="Notes" error="Some error">
          child
        </Field>
      );

      expect(warnSpy).toHaveBeenCalledWith(
        "Field: error prop provided but htmlFor is absent. Errors are only rendered when htmlFor is specified."
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("does not render error element when error is empty string", () => {
    render(
      <Field label="Name" htmlFor="name-input" error="">
        <input id="name-input" />
      </Field>
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
