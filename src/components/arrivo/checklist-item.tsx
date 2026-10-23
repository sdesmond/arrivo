"use client";

import { useState, useRef, useEffect } from "react";
import { cn, pluralize } from "@/lib/utils";
import { ListChecks, Trash2, ChevronDown, CheckCheck } from "lucide-react";
import type { Checklist } from "@/data/types";
import { ChecklistItemRow } from "./checklist-item-row";
import { useCanEditTrip } from "./trip-edit-access";

export interface ChecklistItemProps {
  checklist: Checklist;
  isDraft?: boolean;
  initiallyExpanded?: boolean;
  onCommitDraft?: (firstItemContent?: string) => void;
  onCancelDraft?: () => void;
  onTitleUpdate?: (id: string, title: string | undefined) => void;
  onDelete?: (id: string) => void;
  onAddItem?: (checklistId: string, content: string) => void;
  onUpdateItem?: (itemId: string, content: string) => void;
  onDeleteItem?: (itemId: string) => void;
  onToggleItem?: (itemId: string) => void;
  dragHandle?: React.ReactNode;
  displayOnly?: boolean;
}

export function ChecklistItem({
  checklist,
  isDraft,
  initiallyExpanded,
  onCommitDraft,
  onCancelDraft,
  onTitleUpdate,
  onDelete,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
  onToggleItem,
  dragHandle,
  displayOnly,
}: ChecklistItemProps) {
  const canEdit = useCanEditTrip();
  const [isExpanded, setIsExpanded] = useState(initiallyExpanded ?? !!isDraft);
  // The revalidated tree can mount a new checklist before it's marked newly created, so honor the
  // flag turning on after mount too; turning it off never collapses.
  const [prevInitiallyExpanded, setPrevInitiallyExpanded] = useState(initiallyExpanded);
  if (initiallyExpanded !== prevInitiallyExpanded) {
    setPrevInitiallyExpanded(initiallyExpanded);
    if (initiallyExpanded) setIsExpanded(true);
  }
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(checklist.title ?? "");
  const [itemInput, setItemInput] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);

  const itemCount = checklist.items.length;
  const checkedCount = checklist.items.filter((item) => item.isChecked).length;
  const isComplete = itemCount > 0 && checkedCount === itemCount;
  const prevCompleteRef = useRef(false);
  const [justCompleted, setJustCompleted] = useState(false);

  useEffect(() => {
    if (isComplete && !prevCompleteRef.current) {
      prevCompleteRef.current = true;
      setJustCompleted(true);
      const timer = setTimeout(() => {
        setJustCompleted(false);
        if (!isDraft) setIsExpanded(false);
      }, 600);
      return () => clearTimeout(timer);
    }
    if (!isComplete && prevCompleteRef.current) {
      prevCompleteRef.current = false;
      setJustCompleted(false);
    }
  }, [isComplete, isDraft]);

  const genericLabel = `Checklist · ${pluralize(itemCount, "item")}`;
  const headerLabel = isExpanded && checklist.title ? genericLabel : (checklist.title ?? genericLabel);

  function saveTitle() {
    const trimmed = draftTitle.trim() || undefined;
    if (trimmed !== checklist.title) {
      onTitleUpdate?.(checklist.id, trimmed);
    }
    setIsEditingTitle(false);
  }

  function commitNewItem() {
    const trimmed = itemInput.trim();
    if (trimmed) {
      onAddItem?.(checklist.id, trimmed);
      setItemInput("");
    }
  }

  function handleWrapperBlur(event: React.FocusEvent<HTMLDivElement>) {
    const relatedTarget = event.relatedTarget as Element | null;
    if (!canEdit || wrapperRef.current?.contains(relatedTarget)) return;
    if (isDraft) {
      const trimmed = itemInput.trim();
      if (trimmed) onCommitDraft?.(trimmed);
      else onCancelDraft?.();
    } else if (checklist.items.length === 0 && itemInput.trim() === "") {
      onDelete?.(checklist.id);
    }
  }

  function handleItemKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      const trimmed = itemInput.trim();
      if (isDraft) {
        if (trimmed) onCommitDraft?.(trimmed);
        else onCancelDraft?.();
      } else {
        if (trimmed) commitNewItem();
      }
    }
    if (event.key === "Escape") {
      event.preventDefault();
      if (isDraft) onCancelDraft?.();
      else setItemInput("");
    }
  }

  return (
    <div
      id={displayOnly ? undefined : `checklist-${checklist.id}`}
      ref={wrapperRef}
      onBlur={handleWrapperBlur}
      className="group relative"
      style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--fg-2)" }}
    >
      {/* Header */}
      <button
        className={cn(
          "w-full flex items-center gap-2.5 px-3 py-2.5 text-left",
          !isDraft && canEdit && (dragHandle ? "pr-16" : "pr-9")
        )}
        style={{ background: "none", border: "none", cursor: "pointer" }}
        onClick={() => {
          if (!isDraft) setIsExpanded((prev) => !prev);
        }}
      >
        <span
          className="flex items-center justify-center shrink-0"
          style={{
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: "var(--surface-2)",
            color: "var(--fg-3)",
          }}
        >
          <ListChecks size={12} strokeWidth={1.5} />
        </span>
        <span
          style={{
            flex: 1,
            color: "var(--fg-2)",
            textDecoration: isComplete && !isDraft ? "line-through" : "none",
            display: "flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          {headerLabel}
          {!isDraft && isComplete && (
            <CheckCheck
              size={13}
              strokeWidth={1.5}
              aria-label="Complete"
              style={{
                color: "var(--fg-3)",
                flexShrink: 0,
                animation: justCompleted ? "checklist-complete 0.4s ease-out" : undefined,
              }}
            />
          )}
        </span>
        {!isDraft && !isComplete && itemCount > 0 && (
          <span style={{ fontSize: "calc(11px * var(--font-scale))", color: "var(--fg-4)", flexShrink: 0 }}>
            {checkedCount}/{itemCount}
          </span>
        )}
        <ChevronDown
          size={13}
          strokeWidth={1.5}
          style={{
            color: "var(--fg-4)",
            transform: isExpanded ? "rotate(180deg)" : undefined,
            transition: "transform 0.15s",
            flexShrink: 0,
          }}
        />
      </button>

      {/* Expanded body */}
      {(isExpanded || isDraft) && (
        <div style={{ paddingLeft: 37, paddingRight: 8, paddingBottom: 8 }}>
          {/* Title area */}
          {isEditingTitle ? (
            <input
              autoFocus
              value={draftTitle}
              placeholder="Add title..."
              onChange={(event) => setDraftTitle(event.target.value)}
              onBlur={saveTitle}
              onKeyDown={(event) => {
                if (event.key === "Enter") saveTitle();
                if (event.key === "Escape") {
                  setDraftTitle(checklist.title ?? "");
                  setIsEditingTitle(false);
                }
              }}
              style={{
                fontSize: "calc(13px * var(--font-scale))",
                fontWeight: 500,
                color: "var(--fg)",
                background: "transparent",
                border: "none",
                borderBottom: "1px solid var(--accent-brand)",
                outline: "none",
                width: "100%",
                fontFamily: "inherit",
                padding: "1px 0",
                marginBottom: 4,
                display: "block",
              }}
            />
          ) : !canEdit ? (
            checklist.title && (
              <div style={{ fontWeight: 500, color: "var(--fg)", padding: "1px 0", marginBottom: 4 }}>
                {checklist.title}
              </div>
            )
          ) : (
            <div
              role="button"
              tabIndex={0}
              onClick={() => {
                setDraftTitle(checklist.title ?? "");
                setIsEditingTitle(true);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setDraftTitle(checklist.title ?? "");
                  setIsEditingTitle(true);
                }
              }}
              style={{
                fontSize: "calc(13px * var(--font-scale))",
                fontWeight: checklist.title ? 500 : 400,
                color: checklist.title ? "var(--fg)" : "var(--fg-4)",
                cursor: "text",
                minHeight: "1.4em",
                padding: "1px 0",
                marginBottom: 4,
              }}
            >
              {checklist.title ?? "Add title..."}
            </div>
          )}

          {/* Existing items */}
          {checklist.items.map((item) => (
            <ChecklistItemRow
              key={item.id}
              item={item}
              onToggle={onToggleItem}
              onUpdate={onUpdateItem}
              onDelete={onDeleteItem}
            />
          ))}

          {/* Persistent add-item row */}
          {canEdit && (
            <input
              autoFocus={!!isDraft}
              value={itemInput}
              placeholder="Add an item…"
              onChange={(event) => setItemInput(event.target.value)}
              onKeyDown={handleItemKeyDown}
              onBlur={!isDraft ? commitNewItem : undefined}
              style={{
                fontSize: "calc(13px * var(--font-scale))",
                color: "var(--fg-2)",
                background: "transparent",
                border: "none",
                outline: "none",
                width: "100%",
                fontFamily: "inherit",
                padding: "2px 0",
              }}
            />
          )}
        </div>
      )}

      {/* Drag handle — always visible on mobile, hover-only on desktop */}
      {canEdit && !isDraft && dragHandle && (
        <span
          className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity absolute top-2 flex items-center"
          style={{ right: 32, color: "var(--fg-4)", padding: 4 }}
        >
          {dragHandle}
        </span>
      )}

      {/* Delete button */}
      {canEdit && !isDraft && (
        <button
          onClick={() => onDelete?.(checklist.id)}
          className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity absolute right-2 top-2"
          title="Delete checklist"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--fg-3)",
            padding: 4,
          }}
        >
          <Trash2 size={13} strokeWidth={1.5} />
        </button>
      )}
    </div>
  );
}
