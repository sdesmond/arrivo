// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DocRow } from "./doc-row";
import type { Document } from "@/data/types";

const makeDoc = (overrides: Partial<Document> = {}): Document => ({
  id: "doc-1",
  name: "Boarding Pass.pdf",
  kind: "pdf",
  scope: "trip",
  offline: false,
  ...overrides,
});

describe("DocRow", () => {
  it("renders the document name", () => {
    render(<DocRow doc={makeDoc()} />);
    expect(screen.getByText("Boarding Pass.pdf")).toBeInTheDocument();
  });

  it("renders PDF badge for pdf kind", () => {
    render(<DocRow doc={makeDoc({ kind: "pdf" })} />);
    expect(screen.getByText("PDF")).toBeInTheDocument();
  });

  it("renders IMG badge for image kind", () => {
    render(<DocRow doc={makeDoc({ kind: "image", name: "photo.jpg" })} />);
    expect(screen.getByText("IMG")).toBeInTheDocument();
  });

  it("renders DOC badge for doc kind", () => {
    render(<DocRow doc={makeDoc({ kind: "doc", name: "contract.docx" })} />);
    expect(screen.getByText("DOC")).toBeInTheDocument();
  });

  it("renders LINK badge for link kind", () => {
    render(<DocRow doc={makeDoc({ kind: "link", name: "Reference" })} />);
    expect(screen.getByText("LINK")).toBeInTheDocument();
  });

  it("renders document name for image doc", () => {
    render(<DocRow doc={makeDoc({ kind: "image", name: "vacation-photo.png" })} />);
    expect(screen.getByText("vacation-photo.png")).toBeInTheDocument();
  });
});
