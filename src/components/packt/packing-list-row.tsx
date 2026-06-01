"use client";

import { useEffect, useRef, type ReactElement } from "react";
import { GripVertical, Check, X } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { PackingItem } from "@/data/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface PackingRowProps {
  item: PackingItem;
  isLabel?: boolean;
  isPending?: boolean;
  dragHandle?: ReactElement;
  onRemove: () => void;
  onToggle?: () => void;
}

export interface SortablePackingRowProps extends PackingRowProps {
  id: string;
}

export function PackingRow({
  item,
  isLabel,
  isPending,
  dragHandle,
  onRemove,
  onToggle,
}: PackingRowProps): ReactElement {
  return (
    <div
      className={cn("flex min-h-11 items-center gap-3 rounded-2xl border px-3 py-2", isLabel ? "shadow-none" : "")}
      data-packing-kind={isLabel ? "label" : "item"}
      style={{
        background: isLabel ? "var(--surface-2)" : "var(--bg)",
        borderColor: "var(--line)",
      }}
    >
      {dragHandle ? dragHandle : null}
      {isLabel || !onToggle ? null : (
        <button
          aria-checked={item.done}
          aria-label={`Pack ${item.name}`}
          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center"
          disabled={isPending}
          role="checkbox"
          title={item.done ? `Unpack ${item.name}` : `Pack ${item.name}`}
          type="button"
          style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
          onClick={onToggle}
        >
          <span
            className="flex size-5 items-center justify-center rounded-full"
            style={{
              background: item.done ? "var(--accent-brand)" : "transparent",
              border: item.done ? "1.5px solid var(--accent-brand)" : "1.5px solid var(--line-strong)",
              color: item.done ? "var(--accent-fg)" : "transparent",
            }}
          >
            {item.done ? <Check size={12} strokeWidth={1.5} /> : null}
          </span>
        </button>
      )}
      <div className="min-w-0 flex-1">
        {isLabel ? (
          <h3 className="truncate text-sm font-semibold" data-packing-name style={{ color: "var(--fg)" }}>
            {item.name}
          </h3>
        ) : (
          <p
            className={cn("truncate text-sm font-medium", item.done ? "line-through" : "")}
            data-packing-name
            style={{ color: item.done ? "var(--fg-3)" : "var(--fg)" }}
          >
            {item.name}
          </p>
        )}
        {isLabel ? (
          <p style={{ color: "var(--fg-3)", fontSize: "calc(12px * var(--font-scale))" }}>Section label</p>
        ) : null}
      </div>
      <Button
        aria-label={`Remove ${item.name}`}
        className="min-h-11 min-w-11 rounded-2xl text-fg-3 hover:text-fg"
        title={`Remove ${item.name}`}
        type="button"
        variant="ghost"
        onClick={onRemove}
      >
        <X size={14} strokeWidth={1.5} />
      </Button>
    </div>
  );
}

export function SortablePackingRow({ id, ...props }: SortablePackingRowProps): ReactElement {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: props.isLabel,
    animateLayoutChanges: () => false,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };
  const dragHandleRef = useRef<HTMLSpanElement>(null);
  const prevIsDraggingRef = useRef(false);

  useEffect(() => {
    if (prevIsDraggingRef.current && !isDragging && dragHandleRef.current) {
      dragHandleRef.current.focus();
    }
    prevIsDraggingRef.current = isDragging;
  }, [isDragging]);

  const dragHandle = props.isLabel ? undefined : (
    <span
      ref={dragHandleRef}
      {...attributes}
      {...listeners}
      aria-label={`Reorder ${props.item.name}`}
      className="flex min-h-11 min-w-11 items-center justify-center rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2"
      role="button"
      tabIndex={0}
      title={`Reorder ${props.item.name}`}
      style={{ cursor: "grab", touchAction: "none", outlineColor: "var(--accent-brand)" }}
    >
      <GripVertical size={14} strokeWidth={1.5} />
    </span>
  );

  return (
    <div ref={setNodeRef} style={style}>
      <PackingRow {...props} dragHandle={dragHandle} />
    </div>
  );
}
