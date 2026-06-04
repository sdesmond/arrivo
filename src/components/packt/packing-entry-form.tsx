"use client";

import { useId, type ChangeEvent, type FormEvent, type ReactElement } from "react";
import { Plus, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface PackingEntryFormProps {
  draftName: string;
  hasItems: boolean;
  isSubmitting: boolean;
  onDraftNameChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onSubmitItem: () => void;
  onSubmitLabel: () => void;
}

const minimumTouchTargetStyle = { minHeight: "44px", minWidth: "44px" } as const;

export function PackingEntryForm({
  draftName,
  hasItems,
  isSubmitting,
  onDraftNameChange,
  onSubmitItem,
  onSubmitLabel,
}: PackingEntryFormProps): ReactElement {
  const formId = useId();

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!draftName.trim()) return;
    onSubmitItem();
  }

  return (
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
        placeholder={hasItems ? "Add another item or section label" : "Add your first item or section label"}
        style={{ background: "var(--bg)", color: "var(--fg)", minHeight: "44px" }}
        value={draftName}
        onChange={onDraftNameChange}
      />
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          className="min-h-11 min-w-11 flex-1 rounded-2xl"
          disabled={isSubmitting}
          style={minimumTouchTargetStyle}
          type="submit"
        >
          <Plus size={16} strokeWidth={1.5} />
          Add item
        </Button>
        <Button
          className="min-h-11 min-w-11 flex-1 rounded-2xl"
          disabled={isSubmitting}
          style={minimumTouchTargetStyle}
          type="button"
          variant="outline"
          onClick={onSubmitLabel}
        >
          <Tag size={16} strokeWidth={1.5} />
          Add label
        </Button>
      </div>
    </form>
  );
}
