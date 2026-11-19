"use client";

import { useState } from "react";
import type { ReactElement } from "react";
import { ChevronLeft } from "lucide-react";
import { PackingListOverview } from "./packing-list-overview";
import { PackingListView } from "./packing-list-view";
import type {
  PackingItem,
  PackingTemplate,
  PullTemplatesResult,
  RemovePackingSectionInput,
  TripPackingList,
} from "@/data/types";
import { FIELD_LIMITS } from "@/lib/validation-limits";

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
  onToggleItem: (id: string, isPacked: boolean) => Promise<void>;
  onReorderItems: (ordered: { id: string; labelId: string | null; position: number }[], onError?: () => void) => void;
  onEditItem?: (id: string, name: string) => void;
  onPullTemplates?: (templateIds: string[], listId?: string | null) => Promise<PullTemplatesResult | undefined>;
  onSaveAsTemplate?: (name: string) => Promise<string | undefined>;
  onCreateList: (name: string) => Promise<string | undefined>;
  onRenameList: (listId: string, name: string) => Promise<void>;
  onDeleteList: (listId: string) => Promise<void>;
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
            maxLength={FIELD_LIMITS.packingListName}
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

  return (
    <PackingListOverview
      packingLists={packingLists}
      packingItems={packingItems}
      onOpen={setActiveListId}
      onCreated={(id, name) => {
        setPendingCreatedList({ id, name });
        setActiveListId(id);
      }}
      onCreateList={onCreateList}
      onRenameList={onRenameList}
      onDeleteList={onDeleteList}
    />
  );
}
