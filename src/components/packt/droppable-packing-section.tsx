"use client";

import type { ReactNode, ReactElement } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";

export interface DroppablePackingSectionProps {
  /** Droppable container id, e.g. "container:<labelId>" or "container:__ungrouped__". */
  containerId: string;
  /** Sortable item ids registered in this container's SortableContext. */
  sortableIds: string[];
  children: ReactNode;
}

/**
 * One drop zone in the packing list. Wraps a container's rows in both a
 * `useDroppable` node (so an empty container still accepts drops) and a
 * per-container `SortableContext` (so cross-container moves are isolated and the
 * collision detector never snaps across a section boundary).
 */
export function DroppablePackingSection({
  containerId,
  sortableIds,
  children,
}: DroppablePackingSectionProps): ReactElement {
  const { setNodeRef } = useDroppable({ id: containerId });

  return (
    <div ref={setNodeRef} data-packing-container={containerId} className="flex flex-col gap-2">
      <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </div>
  );
}
