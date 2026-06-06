"use client";

import { useEffect, useRef, useState, type ReactElement } from "react";
import { ChevronDown, GripVertical, X, Trash2 } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { PackingItem } from "@/data/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

const minimumTouchTargetStyle = { minHeight: "44px", minWidth: "44px" } as const;

export interface PackingRowProps {
  item: PackingItem;
  isLabel?: boolean;
  isComplete?: boolean;
  isPending?: boolean;
  collapsed?: boolean;
  itemCount?: number;
  packedCount?: number;
  onToggleCollapse?: () => void;
  dragHandle?: ReactElement;
  onRemove: () => void;
  onToggle?: () => void;
  onEdit?: (name: string) => void;
}

export interface SortablePackingRowProps extends PackingRowProps {
  id: string;
  isActiveDragSource?: boolean;
}

export function PackingRow({
  item,
  isLabel,
  isComplete,
  isPending,
  collapsed,
  itemCount,
  packedCount,
  onToggleCollapse,
  dragHandle,
  onRemove,
  onToggle,
  onEdit,
}: PackingRowProps): ReactElement {
  const [isEditing, setIsEditing] = useState(false);
  const originalNameRef = useRef(item.name);

  function commitEdit(newName: string): void {
    const trimmed = newName.trim();
    setIsEditing(false);
    if (!trimmed) return;
    if (trimmed === originalNameRef.current) return;
    onEdit?.(trimmed);
  }

  function cancelEdit(): void {
    setIsEditing(false);
  }

  function startEdit(event: React.MouseEvent): void {
    if (!onEdit) return;
    event.stopPropagation();
    originalNameRef.current = item.name;
    setIsEditing(true);
  }

  return (
    <div
      className={cn("flex min-h-11 items-center gap-3 rounded-2xl border px-3 py-2", isLabel ? "shadow-none" : "")}
      data-packing-kind={isLabel ? "label" : "item"}
      onClick={isLabel && onToggleCollapse && !isEditing ? onToggleCollapse : undefined}
      style={{
        background: isLabel ? "var(--surface-2)" : "var(--bg)",
        borderColor: "var(--line)",
        cursor: isLabel && onToggleCollapse && !isEditing ? "pointer" : undefined,
      }}
    >
      {dragHandle ? dragHandle : null}
      {isLabel && onToggleCollapse ? (
        <span className="flex shrink-0 items-center justify-center" style={minimumTouchTargetStyle}>
          <button
            aria-expanded={!collapsed}
            aria-label={collapsed ? `Expand ${item.name}` : `Collapse ${item.name}`}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2"
            data-packing-collapse-btn
            onClick={(event) => {
              event.stopPropagation();
              onToggleCollapse();
            }}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              outlineColor: "var(--accent-brand)",
              touchAction: "manipulation",
            }}
            title={collapsed ? `Expand ${item.name}` : `Collapse ${item.name}`}
            type="button"
          >
            <ChevronDown
              size={14}
              strokeWidth={1.5}
              style={{
                color: "var(--fg-4)",
                transform: collapsed ? undefined : "rotate(180deg)",
                transition: "transform 0.15s",
              }}
            />
          </button>
        </span>
      ) : null}
      {isLabel || !onToggle ? null : (
        <span className="flex shrink-0 items-center justify-center" data-packing-toggle style={minimumTouchTargetStyle}>
          <Checkbox
            aria-label={`Pack ${item.name}`}
            checked={item.done}
            disabled={isPending}
            title={item.done ? `Unpack ${item.name}` : `Pack ${item.name}`}
            onCheckedChange={() => onToggle()}
          />
        </span>
      )}
      <div className="min-w-0 flex-1">
        {isEditing ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              className="min-w-0 flex-1 rounded-md border px-2 py-1 text-sm"
              defaultValue={item.name}
              maxLength={100}
              style={{
                background: "var(--bg)",
                borderColor: "var(--line-strong)",
                color: "var(--fg)",
                outline: "none",
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") commitEdit(event.currentTarget.value);
                if (event.key === "Escape") cancelEdit();
              }}
              onBlur={(event) => {
                // don't commit on blur if focus moved to the delete button inside this row
                const relatedTarget = event.relatedTarget as HTMLElement | null;
                if (relatedTarget?.dataset.packingDeleteBtn) return;
                commitEdit(event.target.value);
              }}
            />
            {isLabel ? (
              <Button
                data-packing-delete-btn="true"
                variant="ghost"
                size="icon"
                className="min-h-11 min-w-11 shrink-0 rounded-2xl text-fg-3 hover:text-fg"
                style={minimumTouchTargetStyle}
                title="Delete label"
                aria-label="Delete label"
                type="button"
                onClick={() => onRemove()}
              >
                <Trash2 size={14} strokeWidth={1.5} />
              </Button>
            ) : null}
          </div>
        ) : (
          <>
            {isLabel ? (
              <h3
                className={cn("w-fit max-w-full truncate text-sm font-semibold", isComplete ? "line-through" : "")}
                data-packing-name
                style={{ color: isComplete ? "var(--fg-3)" : "var(--fg)", cursor: onEdit ? "pointer" : "default" }}
                onClick={startEdit}
              >
                {item.name}
              </h3>
            ) : (
              <p
                className={cn("truncate text-sm font-medium", item.done ? "line-through" : "")}
                data-packing-name
                style={{
                  color: item.done ? "var(--fg-3)" : "var(--fg)",
                  cursor: onEdit ? "pointer" : "default",
                }}
                onClick={startEdit}
              >
                {item.name}
              </p>
            )}
            {isLabel && itemCount !== undefined ? (
              <p style={{ color: "var(--fg-3)", fontSize: "calc(12px * var(--font-scale))" }}>
                {packedCount !== undefined
                  ? `${packedCount} of ${itemCount} packed`
                  : `${itemCount} ${itemCount === 1 ? "item" : "items"}`}
              </p>
            ) : null}
          </>
        )}
      </div>
      {!isEditing ? (
        <Button
          aria-label={`Remove ${item.name}`}
          className="min-h-11 min-w-11 rounded-2xl text-fg-3 hover:text-fg"
          style={minimumTouchTargetStyle}
          title={`Remove ${item.name}`}
          type="button"
          variant="ghost"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
        >
          <X size={14} strokeWidth={1.5} />
        </Button>
      ) : null}
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
    opacity: props.isActiveDragSource ? 0 : 1,
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
      style={{ cursor: "grab", touchAction: "none", outlineColor: "var(--accent-brand)", ...minimumTouchTargetStyle }}
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
