"use client";

import { useState, useRef, useEffect } from "react";
import { ListChecks, Trash2, ChevronDown, Check, CheckCheck } from "lucide-react";
import type { Checklist } from "@/data/types";

export interface ChecklistItemProps {
  checklist: Checklist;
  isDraft?: boolean;
  onCommitDraft?: () => void;
  onCancelDraft?: () => void;
  onTitleUpdate?: (id: string, title: string | undefined) => void;
  onDelete?: (id: string) => void;
  onAddItem?: (checklistId: string, content: string) => void;
  onUpdateItem?: (itemId: string, content: string) => void;
  onDeleteItem?: (itemId: string) => void;
  onToggleItem?: (itemId: string) => void;
}

export function ChecklistItem({
  checklist,
  isDraft,
  onCommitDraft,
  onCancelDraft,
  onTitleUpdate,
  onDelete,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
  onToggleItem,
}: ChecklistItemProps) {
  const [isExpanded, setIsExpanded] = useState(!!isDraft);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(checklist.title ?? "");
  const [itemInput, setItemInput] = useState("");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItemContent, setEditingItemContent] = useState("");
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

  const genericLabel = `Checklist · ${itemCount} item${itemCount === 1 ? "" : "s"}`;
  const headerLabel = (isExpanded && checklist.title) ? genericLabel : (checklist.title ?? genericLabel);

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

  function saveItemEdit() {
    if (!editingItemId) return;
    const trimmed = editingItemContent.trim();
    if (trimmed) onUpdateItem?.(editingItemId, trimmed);
    setEditingItemId(null);
  }

  function handleWrapperBlur(e: React.FocusEvent<HTMLDivElement>) {
    const relatedTarget = e.relatedTarget as Element | null;
    if (wrapperRef.current?.contains(relatedTarget)) return;
    if (isDraft) {
      const trimmed = itemInput.trim();
      if (trimmed) onCommitDraft?.();
      else onCancelDraft?.();
    } else if (checklist.items.length === 0 && itemInput.trim() === "") {
      onDelete?.(checklist.id);
    }
  }

  function handleItemKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      const trimmed = itemInput.trim();
      if (isDraft) {
        if (trimmed) onCommitDraft?.();
        else onCancelDraft?.();
      } else {
        if (trimmed) commitNewItem();
      }
    }
    if (e.key === "Escape") {
      e.preventDefault();
      if (isDraft) onCancelDraft?.();
      else setItemInput("");
    }
  }

  return (
    <div
      id={`checklist-${checklist.id}`}
      ref={wrapperRef}
      onBlur={handleWrapperBlur}
      className="group relative"
      style={{ fontSize: 13, color: "var(--fg-2)" }}
    >
      {/* Header */}
      <button
        className="w-full flex items-center gap-2.5 px-3 py-2 text-left"
        style={{ background: "none", border: "none", cursor: "pointer" }}
        onClick={() => { if (!isDraft) setIsExpanded((v) => !v); }}
      >
        <span
          className="flex items-center justify-center shrink-0"
          style={{
            width: 22, height: 22,
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
          <span style={{ fontSize: 11, color: "var(--fg-4)", flexShrink: 0 }}>
            {checkedCount}/{itemCount}
          </span>
        )}
        {!isDraft && (
          <ChevronDown
            size={13} strokeWidth={1.5}
            style={{
              color: "var(--fg-4)",
              transform: isExpanded ? "rotate(180deg)" : undefined,
              transition: "transform 0.15s",
              flexShrink: 0,
            }}
          />
        )}
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
              onChange={(e) => setDraftTitle(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveTitle();
                if (e.key === "Escape") {
                  setDraftTitle(checklist.title ?? "");
                  setIsEditingTitle(false);
                }
              }}
              style={{
                fontSize: 13, fontWeight: 500,
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
          ) : (
            <div
              role="button"
              tabIndex={0}
              onClick={() => { setDraftTitle(checklist.title ?? ""); setIsEditingTitle(true); }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setDraftTitle(checklist.title ?? "");
                  setIsEditingTitle(true);
                }
              }}
              style={{
                fontSize: 13,
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
            <div key={item.id} className="group/item relative flex items-start gap-2 py-0.5">
              <button
                onClick={() => onToggleItem?.(item.id)}
                title={item.isChecked ? "Uncheck item" : "Check item"}
                aria-label={item.isChecked ? "Uncheck item" : "Check item"}
                style={{
                  width: 14,
                  height: 14,
                  border: `1.5px solid ${item.isChecked ? "var(--accent-brand)" : "var(--fg-4)"}`,
                  borderRadius: 3,
                  flexShrink: 0,
                  marginTop: 1,
                  background: item.isChecked ? "var(--accent-brand)" : "transparent",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 0,
                  transition: "background 0.1s, border-color 0.1s",
                }}
              >
                {item.isChecked && (
                  <Check size={9} strokeWidth={2.5} style={{ color: "var(--accent-fg)" }} />
                )}
              </button>
              {editingItemId === item.id ? (
                <input
                  autoFocus
                  value={editingItemContent}
                  onChange={(e) => setEditingItemContent(e.target.value)}
                  onBlur={saveItemEdit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); saveItemEdit(); }
                    if (e.key === "Escape") { e.preventDefault(); setEditingItemId(null); }
                  }}
                  style={{
                    flex: 1,
                    fontSize: 13,
                    color: "var(--fg-2)",
                    background: "transparent",
                    border: "none",
                    borderBottom: "1px solid var(--accent-brand)",
                    outline: "none",
                    fontFamily: "inherit",
                    padding: 0,
                  }}
                />
              ) : (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={() => { setEditingItemContent(item.content); setEditingItemId(item.id); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setEditingItemContent(item.content);
                      setEditingItemId(item.id);
                    }
                  }}
                  style={{
                    flex: 1,
                    cursor: "text",
                    color: item.isChecked ? "var(--fg-4)" : "var(--fg-2)",
                    textDecoration: item.isChecked ? "line-through" : "none",
                  }}
                >
                  {item.content}
                </span>
              )}
              <button
                onClick={() => onDeleteItem?.(item.id)}
                title="Delete item"
                className="opacity-100 sm:opacity-0 sm:group-hover/item:opacity-100 transition-opacity"
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--fg-3)",
                  padding: "0 2px",
                  flexShrink: 0,
                }}
              >
                <Trash2 size={11} strokeWidth={1.5} />
              </button>
            </div>
          ))}

          {/* Persistent add-item row */}
          <input
            autoFocus={!!isDraft}
            value={itemInput}
            placeholder="Add an item…"
            onChange={(e) => setItemInput(e.target.value)}
            onKeyDown={handleItemKeyDown}
            onBlur={!isDraft ? commitNewItem : undefined}
            style={{
              fontSize: 13,
              color: "var(--fg-2)",
              background: "transparent",
              border: "none",
              outline: "none",
              width: "100%",
              fontFamily: "inherit",
              padding: "2px 0",
            }}
          />
        </div>
      )}

      {/* Delete button */}
      {!isDraft && (
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
