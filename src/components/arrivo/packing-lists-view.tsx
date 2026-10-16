"use client";

import { useState } from "react";
import type { ReactElement } from "react";
import { Pencil, Trash2, ChevronLeft, Plus, Backpack } from "lucide-react";
import { PackingListView } from "./packing-list-view";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import type {
  PackingItem,
  PackingTemplate,
  PullTemplatesResult,
  RemovePackingSectionInput,
  TripPackingList,
} from "@/data/types";
import { cn } from "@/lib/utils";

export interface PackingListsViewProps {
  tripId: string;
  packingLists: TripPackingList[];
  packingItems: PackingItem[];
  templates: PackingTemplate[];
  onAddItem: (
    name: string,
    isLabel?: boolean,
    afterItemId?: string,
    beforeItemId?: string,
    labelId?: string | null,
    listId?: string | null
  ) => Promise<void>;
  onRemoveItem: (id: string) => Promise<void>;
  onRemoveSection?: (id: string, input: RemovePackingSectionInput) => Promise<void>;
  onToggleItem: (id: string) => Promise<void>;
  onReorderItems: (ordered: { id: string; labelId: string | null; position: number }[], onError?: () => void) => void;
  onEditItem?: (id: string, name: string) => void;
  onPullTemplates?: (templateIds: string[], listId?: string | null) => Promise<PullTemplatesResult | undefined>;
  onSaveAsTemplate?: (name: string) => Promise<string | undefined>;
  onCreateList: (name: string) => Promise<string | undefined>;
  onRenameList: (listId: string, name: string) => Promise<void>;
  onDeleteList: (listId: string) => Promise<void>;
}

interface PendingDelete {
  listId: string;
  listName: string;
  itemCount: number;
}

interface RenameState {
  listId: string;
  value: string;
}

interface PendingCreatedList {
  id: string;
  name: string;
}

export function PackingListsView({
  tripId,
  packingLists,
  packingItems,
  templates,
  onAddItem,
  onRemoveItem,
  onRemoveSection,
  onToggleItem,
  onReorderItems,
  onEditItem,
  onPullTemplates,
  onSaveAsTemplate,
  onCreateList,
  onRenameList,
  onDeleteList,
}: PackingListsViewProps): ReactElement {
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [renameState, setRenameState] = useState<RenameState | null>(null);
  const [newListName, setNewListName] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [pendingCreatedList, setPendingCreatedList] = useState<PendingCreatedList | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const persistedActiveList =
    activeListId === null ? null : packingLists.find((candidate) => candidate.id === activeListId);
  const pendingActiveList =
    activeListId !== null && pendingCreatedList?.id === activeListId && persistedActiveList === null
      ? {
          id: pendingCreatedList.id,
          tripId,
          name: pendingCreatedList.name,
          position: packingLists.length,
        }
      : null;
  const activeList = activeListId === null ? null : (persistedActiveList ?? pendingActiveList);

  if (activeListId !== null && activeList !== null) {
    const listItems = packingItems.filter((item) => item.listId === activeListId);

    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <button
          onClick={() => {
            setActiveListId(null);
            setPendingCreatedList(null);
          }}
          className="inline-flex items-center gap-1.5 self-start rounded-lg px-2 py-1 transition-colors hover:bg-surface"
          style={{
            fontSize: "calc(13px * var(--font-scale))",
            color: "var(--fg-3)",
            border: "none",
            background: "none",
            cursor: "pointer",
          }}
        >
          <ChevronLeft size={14} strokeWidth={1.5} />
          All lists
        </button>
        {isEditingTitle ? (
          <input
            autoFocus
            className="w-full rounded-md border px-2 py-1"
            maxLength={30}
            value={titleDraft}
            onChange={(event) => setTitleDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                const trimmed = titleDraft.trim();
                setIsEditingTitle(false);
                if (trimmed && trimmed !== activeList.name) {
                  void onRenameList(activeListId, trimmed);
                }
              }
              if (event.key === "Escape") {
                setIsEditingTitle(false);
              }
            }}
            onBlur={() => setIsEditingTitle(false)}
            style={{
              fontWeight: 600,
              fontSize: "calc(15px * var(--font-scale))",
              color: "var(--fg)",
              background: "var(--surface)",
              borderColor: "var(--accent-brand)",
              outline: "none",
            }}
          />
        ) : (
          <h2
            onClick={() => {
              setTitleDraft(activeList.name);
              setIsEditingTitle(true);
            }}
            style={{
              fontWeight: 600,
              fontSize: "calc(15px * var(--font-scale))",
              color: "var(--fg)",
              cursor: "pointer",
            }}
          >
            {activeList.name}
          </h2>
        )}
        <PackingListView
          tripId={tripId}
          items={listItems}
          onAddItem={(name, isLabel, afterItemId, beforeItemId, labelId) =>
            onAddItem(name, isLabel, afterItemId, beforeItemId, labelId, activeListId)
          }
          onRemoveItem={onRemoveItem}
          onRemoveSection={onRemoveSection}
          onToggleItem={onToggleItem}
          onReorderItems={onReorderItems}
          onEditItem={onEditItem}
          templates={templates}
          onPullTemplates={onPullTemplates ? (templateIds) => onPullTemplates(templateIds, activeListId) : undefined}
          onSaveAsTemplate={onSaveAsTemplate}
        />
      </div>
    );
  }

  const hasLists = packingLists.length > 0;

  async function handleCreateList(): Promise<void> {
    const trimmed = newListName.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    try {
      const newId = await onCreateList(trimmed);
      setNewListName("");
      setShowNewForm(false);
      if (newId) {
        setPendingCreatedList({ id: newId, name: trimmed });
        setActiveListId(newId);
      }
    } finally {
      setCreating(false);
    }
  }

  async function handleRenameCommit(): Promise<void> {
    if (!renameState) return;
    const trimmed = renameState.value.trim();
    if (!trimmed) {
      setRenameState(null);
      return;
    }
    await onRenameList(renameState.listId, trimmed);
    setRenameState(null);
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
        {!hasLists && !showNewForm && (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Backpack strokeWidth={1.5} />
              </EmptyMedia>
              <EmptyTitle>No packing lists yet</EmptyTitle>
              <EmptyDescription>Create a list to start organizing your gear.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <button
                onClick={() => setShowNewForm(true)}
                className="inline-flex h-10 items-center gap-2 rounded-lg px-4 transition-colors hover:bg-surface"
                style={{
                  fontSize: "calc(13.5px * var(--font-scale))",
                  color: "var(--fg)",
                  border: "1px solid var(--line)",
                  background: "none",
                  cursor: "pointer",
                }}
              >
                <Plus size={14} strokeWidth={1.5} />
                New List
              </button>
            </EmptyContent>
          </Empty>
        )}

        {showNewForm ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              aria-label="Packing list name"
              maxLength={30}
              placeholder="List name…"
              value={newListName}
              onChange={(evt) => setNewListName(evt.target.value)}
              onKeyDown={(evt) => {
                if (evt.key === "Enter") void handleCreateList();
                if (evt.key === "Escape") {
                  setShowNewForm(false);
                  setNewListName("");
                }
              }}
              className="h-9 flex-1 rounded-lg px-3 outline-none"
              style={{
                fontSize: "calc(13.5px * var(--font-scale))",
                color: "var(--fg)",
                background: "var(--surface)",
                border: "1px solid var(--accent-brand)",
              }}
            />
            <button
              onClick={() => void handleCreateList()}
              disabled={!newListName.trim() || creating}
              className="h-9 rounded-lg px-3 transition-colors hover:bg-surface-2 disabled:opacity-40"
              style={{
                fontSize: "calc(13px * var(--font-scale))",
                color: "var(--fg)",
                border: "1px solid var(--line)",
                background: "none",
                cursor: "pointer",
              }}
            >
              Create
            </button>
            <button
              onClick={() => {
                setShowNewForm(false);
                setNewListName("");
              }}
              className="h-9 rounded-lg px-3 transition-colors hover:bg-surface"
              style={{
                fontSize: "calc(13px * var(--font-scale))",
                color: "var(--fg-3)",
                border: "none",
                background: "none",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        ) : (
          hasLists && (
            <button
              onClick={() => setShowNewForm(true)}
              className="inline-flex h-9 items-center gap-2 self-end rounded-lg px-3 transition-colors hover:bg-surface"
              style={{
                fontSize: "calc(13px * var(--font-scale))",
                color: "var(--fg-3)",
                border: "1px solid var(--line)",
                background: "none",
                cursor: "pointer",
              }}
            >
              <Plus size={13} strokeWidth={1.5} />
              New List
            </button>
          )
        )}

        {hasLists && (
          <div className="flex flex-col gap-1">
            {packingLists.map((list) => {
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
                      maxLength={30}
                      value={renameState.value}
                      onChange={(evt) => setRenameState({ ...renameState, value: evt.target.value })}
                      onBlur={() => void handleRenameCommit()}
                      onKeyDown={(evt) => {
                        if (evt.key === "Enter") void handleRenameCommit();
                        if (evt.key === "Escape") setRenameState(null);
                      }}
                      className="flex-1 rounded px-1 py-0.5 outline-none"
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
                      onClick={() => setActiveListId(list.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1 text-left transition-colors hover:bg-surface"
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
                    className="flex size-8 items-center justify-center rounded-lg transition-colors hover:bg-surface-2"
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
                    className="flex size-8 items-center justify-center rounded-lg transition-colors hover:bg-surface-2"
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

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{pendingDelete?.listName}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This list contains {pendingDelete?.itemCount} {pendingDelete?.itemCount === 1 ? "item" : "items"}.
              Deleting it will permanently remove all items in the list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (!pendingDelete) return;
                void onDeleteList(pendingDelete.listId);
                setPendingDelete(null);
              }}
            >
              Delete List
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
