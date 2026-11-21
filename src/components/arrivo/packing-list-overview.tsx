"use client";

import { useRef, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { PackingListCreateForm } from "@/components/arrivo/packing-list-create-form";
import { PackingListDeleteDialog, type PendingPackingListDelete } from "@/components/arrivo/packing-list-delete-dialog";
import type { PackingItem, TripPackingList } from "@/data/types";
import { cn } from "@/lib/utils";
import { FIELD_LIMITS } from "@/lib/validation-limits";

interface PackingListOverviewProps {
  packingLists: TripPackingList[];
  packingItems: PackingItem[];
  onOpen: (id: string) => void;
  onCreated: (id: string, name: string) => void;
  onCreateList: (name: string) => Promise<string | undefined>;
  onRenameList: (id: string, name: string) => Promise<void>;
  onDeleteList: (id: string) => Promise<void>;
}

interface RenameState {
  listId: string;
  value: string;
}

export function PackingListOverview({
  packingLists,
  packingItems,
  onOpen,
  onCreated,
  onCreateList,
  onRenameList,
  onDeleteList,
}: PackingListOverviewProps) {
  const [pendingDelete, setPendingDelete] = useState<PendingPackingListDelete | null>(null);
  const [renameState, setRenameState] = useState<RenameState | null>(null);
  // Shows a committed rename while the stored name is still the one it replaced. A refresh (or another editor's
  // rename) changes the stored name and ends the override; the timer ends it when a save was rejected.
  const [pendingNames, setPendingNames] = useState<Record<string, { name: string; from: string; token: number }>>({});
  const renameToken = useRef(0);
  const hasLists = packingLists.length > 0;

  async function handleRenameCommit(): Promise<void> {
    if (!renameState) return;
    const trimmed = renameState.value.trim();
    if (!trimmed) {
      setRenameState(null);
      return;
    }
    const { listId } = renameState;
    const from = packingLists.find((list) => list.id === listId)?.name ?? "";
    const token = ++renameToken.current;
    setPendingNames((current) => ({ ...current, [listId]: { name: trimmed, from, token } }));
    setRenameState(null);
    try {
      await onRenameList(listId, trimmed);
    } finally {
      // The refresh normally lands first; this clears the entry if it never does (a rejected save).
      setTimeout(() => {
        setPendingNames((current) => {
          if (current[listId]?.token !== token) return current;
          const rest = { ...current };
          delete rest[listId];
          return rest;
        });
      }, 4000);
    }
  }

  function handleDeleteRequest(list: TripPackingList): void {
    const itemCount = packingItems.filter((item) => item.listId === list.id && !item.isLabel).length;
    if (itemCount > 0) {
      setPendingDelete({ listId: list.id, listName: list.name, itemCount });
    } else {
      void onDeleteList(list.id);
    }
  }

  return (
    <>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
        <PackingListCreateForm hasLists={hasLists} onCreateList={onCreateList} onCreated={onCreated} />

        {hasLists && (
          <div className="flex flex-col gap-1">
            {packingLists.map((storedList) => {
              const pending = pendingNames[storedList.id];
              const list =
                pending && pending.from === storedList.name ? { ...storedList, name: pending.name } : storedList;
              const itemCount = packingItems.filter((item) => item.listId === list.id && !item.isLabel).length;
              const isRenaming = renameState?.listId === list.id;

              return (
                <div
                  key={list.id}
                  className={cn("flex items-center gap-2 rounded-xl px-2 py-2")}
                  style={{
                    border: "1px solid var(--line)",
                    background: "var(--bg)",
                  }}
                >
                  {isRenaming ? (
                    <input
                      autoFocus
                      aria-label="Packing list name"
                      maxLength={FIELD_LIMITS.packingListName}
                      value={renameState.value}
                      onChange={(evt) => setRenameState({ ...renameState, value: evt.target.value })}
                      onBlur={() => void handleRenameCommit()}
                      onKeyDown={(evt) => {
                        if (evt.key === "Enter") void handleRenameCommit();
                        if (evt.key === "Escape") setRenameState(null);
                      }}
                      className="h-11 min-w-0 flex-1 rounded px-1 py-0.5 outline-none"
                      style={{
                        fontSize: "calc(14px * var(--font-scale))",
                        fontWeight: 500,
                        color: "var(--fg)",
                        background: "var(--surface)",
                        border: "1px solid var(--accent-brand)",
                      }}
                      onClick={(evt) => evt.stopPropagation()}
                    />
                  ) : (
                    <button
                      type="button"
                      aria-label={`Open "${list.name}"`}
                      onClick={() => onOpen(list.id)}
                      className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1 text-left transition-colors hover:bg-surface"
                      style={{
                        cursor: "pointer",
                        border: "none",
                        background: "none",
                      }}
                    >
                      <span
                        style={{
                          flex: 1,
                          fontWeight: 500,
                          fontSize: "calc(14px * var(--font-scale))",
                          color: "var(--fg)",
                        }}
                      >
                        {list.name}
                      </span>
                      <span
                        style={{
                          fontSize: "calc(12px * var(--font-scale))",
                          color: "var(--fg-3)",
                          marginRight: 4,
                        }}
                      >
                        {itemCount} items
                      </span>
                    </button>
                  )}
                  {isRenaming && (
                    <span style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--fg-3)", marginRight: 4 }}>
                      {itemCount} items
                    </span>
                  )}
                  <button
                    aria-label={`Rename "${list.name}"`}
                    title={`Rename "${list.name}"`}
                    onClick={(evt) => {
                      evt.stopPropagation();
                      setRenameState({ listId: list.id, value: list.name });
                    }}
                    className="flex size-11 items-center justify-center rounded-lg transition-colors hover:bg-surface-2"
                    style={{
                      color: "var(--fg-3)",
                      border: "none",
                      background: "none",
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                  >
                    <Pencil size={14} strokeWidth={1.5} />
                  </button>
                  <button
                    aria-label={`Delete "${list.name}"`}
                    title={`Delete "${list.name}"`}
                    onClick={(evt) => {
                      evt.stopPropagation();
                      handleDeleteRequest(list);
                    }}
                    className="flex size-11 items-center justify-center rounded-lg transition-colors hover:bg-surface-2"
                    style={{
                      color: "var(--fg-3)",
                      border: "none",
                      background: "none",
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                  >
                    <Trash2 size={14} strokeWidth={1.5} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <PackingListDeleteDialog
        pendingDelete={pendingDelete}
        onConfirm={(listId) => {
          void onDeleteList(listId);
          setPendingDelete(null);
        }}
        onDismiss={() => setPendingDelete(null)}
      />
    </>
  );
}
