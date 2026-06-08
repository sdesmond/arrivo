"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactElement } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface ContextualAddFormProps {
  placeholder: string;
  afterItemId?: string;
  beforeItemId?: string;
  labelId?: string | null;
  isAdding?: boolean;
  isLabel?: boolean;
  onAddItem: (
    name: string,
    isLabel?: boolean,
    afterItemId?: string,
    beforeItemId?: string,
    labelId?: string | null
  ) => Promise<void>;
}

export function ContextualAddForm({
  placeholder,
  afterItemId,
  beforeItemId,
  labelId,
  isAdding,
  isLabel = false,
  onAddItem,
}: ContextualAddFormProps): ReactElement {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingFocusRef = useRef(false);

  // Fires when isAdding transitions false → handles the production case where the
  // input was still disabled when the submit resolved (calling focus on a disabled
  // input is a no-op in browsers).
  useEffect(() => {
    if (pendingFocusRef.current && !isAdding) {
      pendingFocusRef.current = false;
      inputRef.current?.focus();
    }
  }, [isAdding]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || isAdding) return;
    try {
      await onAddItem(trimmed, isLabel, afterItemId, beforeItemId, labelId);
      setValue("");
      if (!inputRef.current?.disabled) {
        inputRef.current?.focus();
      } else {
        pendingFocusRef.current = true;
      }
    } catch {
      // Input retains value on failure so the user can retry
    }
  }

  return (
    <form className="flex items-center gap-2" onSubmit={handleSubmit}>
      <Input
        ref={inputRef}
        className="h-9 flex-1 rounded-xl border-0 px-3 text-sm shadow-none"
        disabled={isAdding}
        maxLength={30}
        placeholder={placeholder}
        style={{ background: "var(--surface-2)", color: "var(--fg)" }}
        value={value}
        onChange={(event: ChangeEvent<HTMLInputElement>) => setValue(event.target.value)}
      />
      <Button
        className="h-9 min-w-9 rounded-xl px-2"
        disabled={isAdding || !value.trim()}
        type="submit"
        variant="outline"
        size="sm"
        title={isLabel ? "Add section here" : "Add item here"}
        aria-label={isLabel ? "Add section here" : "Add item here"}
      >
        <Plus size={14} strokeWidth={1.5} />
      </Button>
    </form>
  );
}
