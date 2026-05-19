// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TripDocsTab } from "./trip-docs-tab";
import type { Document } from "@/data/types";

const makeDoc = (id: string): Document => ({
  id,
  name: `Doc ${id}`,
  kind: "pdf",
  scope: "trip",
  offline: false,
});

describe("TripDocsTab", () => {
  it("renders empty state message when docs array is empty", () => {
    render(<TripDocsTab docs={[]} />);
    expect(
      screen.getByText("Add your first trip document — boarding passes, insurance, visas, and more.")
    ).toBeInTheDocument();
  });

  it("renders doc count when one doc is present", () => {
    render(<TripDocsTab docs={[makeDoc("1")]} />);
    expect(screen.getByText("1 document")).toBeInTheDocument();
  });

  it("renders doc count when multiple docs are present", () => {
    render(<TripDocsTab docs={[makeDoc("1"), makeDoc("2"), makeDoc("3")]} />);
    expect(screen.getByText("3 documents")).toBeInTheDocument();
  });
});
