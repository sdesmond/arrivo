"use client";

import type { ChangeEvent, FormEvent, ReactElement } from "react";
import { FolderOpen, Plus, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface PackingListEmptyStateProps {
  tripId: string;
  draftName: string;
  isSubmitting: boolean;
  onDraftNameChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onSubmitItem: () => void;
  onSubmitLabel: () => void;
  onOpenPullDialog?: () => void;
}

export function PackingListEmptyState({
  tripId,
  draftName,
  isSubmitting,
  onDraftNameChange,
  onSubmitItem,
  onSubmitLabel,
  onOpenPullDialog,
}: PackingListEmptyStateProps): ReactElement {
  const formId = `packing-entry-${tripId}`;

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmitItem();
  }

  return (
    <section
      className="flex flex-col gap-4 rounded-3xl border p-5"
      style={{ background: "var(--surface)", borderColor: "var(--line)" }}
    >
      <div className="flex flex-col gap-1">
        <h2 style={{ color: "var(--fg)", fontSize: "calc(20px * var(--font-scale))", fontWeight: 700 }}>
          Your packing list is empty
        </h2>
        <p style={{ color: "var(--fg-2)", fontSize: "calc(14px * var(--font-scale))" }}>
          Start with a quick item or create a section label for this trip.
        </p>
      </div>
      <form
        aria-label="Add a packing entry"
        className="flex flex-col gap-3 rounded-3xl border p-3"
        style={{ background: "var(--surface)", borderColor: "var(--line)" }}
        onSubmit={handleSubmit}
      >
        <label className="sr-only" htmlFor={formId}>
          Packing item name
        </label>
        <Input
          id={formId}
          className="h-11 rounded-2xl border-0 px-3 text-sm shadow-none"
          maxLength={100}
          placeholder="Add your first item or section label"
          style={{ background: "var(--bg)", color: "var(--fg)" }}
          value={draftName}
          onChange={onDraftNameChange}
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button className="min-h-11 min-w-11 flex-1 rounded-2xl" disabled={isSubmitting} type="submit">
            <Plus size={16} strokeWidth={1.5} />
            Add item
          </Button>
          <Button
            className="min-h-11 min-w-11 flex-1 rounded-2xl"
            disabled={isSubmitting}
            type="button"
            variant="outline"
            onClick={onSubmitLabel}
          >
            <Tag size={16} strokeWidth={1.5} />
            Add label
          </Button>
        </div>
      </form>
      {onOpenPullDialog && (
        <Button className="min-h-11 min-w-11 rounded-2xl" variant="outline" onClick={onOpenPullDialog}>
          <FolderOpen size={16} strokeWidth={1.5} />
          Pull from a template
        </Button>
      )}
    </section>
  );
}
