import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DroppablePackingSection } from "./droppable-packing-section";

const useDroppableMock = vi.hoisted(() => vi.fn(() => ({ setNodeRef: vi.fn() })));

vi.mock("@dnd-kit/core", () => ({
  useDroppable: useDroppableMock,
}));

vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: ReactNode }) => <>{children}</>,
  verticalListSortingStrategy: {},
}));

describe("DroppablePackingSection", () => {
  it("registers a droppable for its container id and renders children (outer container is the droppable)", () => {
    render(
      <DroppablePackingSection containerId="container:label-1" sortableIds={["item-1"]} header={<h2>Documents</h2>}>
        <p>Section content</p>
      </DroppablePackingSection>
    );

    expect(useDroppableMock).toHaveBeenCalledWith({ id: "container:label-1" });
    expect(screen.getByText("Documents")).toBeInTheDocument();
    expect(screen.getByText("Section content")).toBeInTheDocument();
    expect(screen.getByText("Documents").closest("[data-packing-dropzone]")).not.toBeNull();
  });

  it("renders an empty container so it can still accept drops", () => {
    render(
      <DroppablePackingSection containerId="container:__ungrouped__" sortableIds={[]}>
        <p>Ungrouped drop zone</p>
      </DroppablePackingSection>
    );

    expect(useDroppableMock).toHaveBeenCalledWith({ id: "container:__ungrouped__" });
    expect(screen.getByText("Ungrouped drop zone")).toBeInTheDocument();
  });

  it("hides children when collapsed is true but droppable ref (outer container) is still rendered", () => {
    const { container } = render(
      <DroppablePackingSection
        containerId="container:label-1"
        sortableIds={["item-1"]}
        collapsed
        header={<h2>Documents</h2>}
      >
        <p>Section content</p>
      </DroppablePackingSection>
    );

    expect(screen.getByText("Documents")).toBeInTheDocument();
    expect(screen.queryByText("Section content")).not.toBeInTheDocument();
    const dropzone = container.querySelector("[data-packing-dropzone]");
    expect(dropzone).toBeInTheDocument();
  });

  it("shows children when collapsed is false and renders droppable ref on outer container", () => {
    const { container } = render(
      <DroppablePackingSection
        containerId="container:label-1"
        sortableIds={["item-1"]}
        collapsed={false}
        header={<h2>Documents</h2>}
      >
        <p>Section content</p>
      </DroppablePackingSection>
    );

    expect(screen.getByText("Documents")).toBeInTheDocument();
    expect(screen.getByText("Section content")).toBeInTheDocument();
    const dropzone = container.querySelector("[data-packing-dropzone]");
    expect(dropzone).toBeInTheDocument();
  });
});
