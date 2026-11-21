"use client";

import { useState } from "react";
import { Backpack, Plus } from "lucide-react";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { FIELD_LIMITS } from "@/lib/validation-limits";

interface PackingListCreateFormProps {
  hasLists: boolean;
  onCreateList: (name: string) => Promise<string | undefined>;
  onCreated: (id: string, name: string) => void;
}

export function PackingListCreateForm({ hasLists, onCreateList, onCreated }: PackingListCreateFormProps) {
  const [newListName, setNewListName] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);
  const [creating, setCreating] = useState(false);

  function closeForm(): void {
    setShowNewForm(false);
    setNewListName("");
  }

  async function handleCreateList(): Promise<void> {
    const trimmed = newListName.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    try {
      const newId = await onCreateList(trimmed);
      // A failed create keeps the typed name so the user can retry without retyping it.
      if (!newId) return;
      closeForm();
      onCreated(newId, trimmed);
    } finally {
      setCreating(false);
    }
  }

  if (showNewForm) {
    return (
      <div className="flex items-center gap-2">
        <input
          autoFocus
          aria-label="Packing list name"
          maxLength={FIELD_LIMITS.packingListName}
          placeholder="List name…"
          value={newListName}
          onChange={(evt) => setNewListName(evt.target.value)}
          onKeyDown={(evt) => {
            if (evt.key === "Enter") void handleCreateList();
            if (evt.key === "Escape") closeForm();
          }}
          className="h-11 min-w-0 flex-1 rounded-lg px-3 outline-none"
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
          className="h-11 rounded-lg px-3 transition-colors hover:bg-surface-2 disabled:opacity-40"
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
          onClick={closeForm}
          className="h-11 rounded-lg px-3 transition-colors hover:bg-surface"
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
    );
  }

  if (!hasLists) {
    return (
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
            className="inline-flex h-11 items-center gap-2 rounded-lg px-4 transition-colors hover:bg-surface"
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
    );
  }

  return (
    <button
      onClick={() => setShowNewForm(true)}
      className="inline-flex h-11 items-center gap-2 self-end rounded-lg px-3 transition-colors hover:bg-surface"
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
  );
}
