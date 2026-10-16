"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Section } from "@/components/arrivo/form-section";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { addCompanion } from "./actions";
import { CompanionRow } from "./companion-row";
import type { Companion } from "@/data/types";

export interface CompanionsSectionProps {
  companions: Companion[];
}

const INPUT_STYLE: React.CSSProperties = {
  background: "var(--surface-2)",
  color: "var(--fg)",
  border: "1px solid var(--line)",
  fontSize: "calc(13px * var(--font-scale))",
};

export function CompanionsSection({ companions }: CompanionsSectionProps) {
  const [name, setName] = useState("");
  const [isAdding, startAdd] = useTransition();

  const nameError = name.trim().length > 50 ? "Companion name must be 50 characters or fewer." : null;

  function handleAdd() {
    const trimmed = name.trim();
    if (!trimmed) return;
    startAdd(async () => {
      const result = await addCompanion({ name: trimmed });
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      setName("");
    });
  }

  return (
    <Section>
      {companions.length === 0 ? (
        <p style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--fg-3)" }}>No companions saved yet.</p>
      ) : (
        <div className="flex flex-col">
          {companions.map((companion) => (
            <CompanionRow key={companion.id} companion={companion} />
          ))}
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <div className="flex-1">
          <label htmlFor="companion-name" className="sr-only">
            Companion name
          </label>
          <input
            id="companion-name"
            type="text"
            placeholder="Name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") handleAdd();
            }}
            aria-describedby={nameError ? "companion-name-error" : "companion-name-hint"}
            aria-invalid={!!nameError || undefined}
            className="w-full rounded-[6px] px-2.5 py-1.5 outline-none transition-colors"
            style={INPUT_STYLE}
          />
          {nameError ? (
            <p
              id="companion-name-error"
              role="status"
              aria-live="polite"
              style={{ fontSize: "calc(11px * var(--font-scale))", color: "var(--destructive)", marginTop: 4 }}
            >
              {nameError}
            </p>
          ) : (
            <span id="companion-name-hint" className="sr-only">
              Enter a name to add a companion
            </span>
          )}
        </div>
        <Button size="sm" onClick={handleAdd} disabled={isAdding || !name.trim() || !!nameError}>
          <Plus size={14} strokeWidth={1.5} aria-hidden="true" />
          Add
        </Button>
      </div>
    </Section>
  );
}
