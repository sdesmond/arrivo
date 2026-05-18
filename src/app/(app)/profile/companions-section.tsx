"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Section } from "@/components/packt/form-section";
import { Button } from "@/components/ui/button";
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
};

export function CompanionsSection({ companions }: CompanionsSectionProps) {
  const [name, setName] = useState("");
  const [isAdding, startAdd] = useTransition();

  function handleAdd() {
    const trimmed = name.trim();
    if (!trimmed) return;
    startAdd(async () => {
      await addCompanion({ name: trimmed });
      setName("");
    });
  }

  return (
    <Section>
      {companions.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--fg-3)" }}>No companions saved yet.</p>
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
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
            }}
            aria-describedby="companion-name-hint"
            className="w-full rounded-[6px] px-2.5 py-1.5 text-[13px] outline-none transition-colors"
            style={INPUT_STYLE}
          />
          <span id="companion-name-hint" className="sr-only">
            Enter a name to add a companion
          </span>
        </div>
        <Button size="sm" onClick={handleAdd} disabled={isAdding || !name.trim()}>
          <Plus size={14} strokeWidth={1.5} aria-hidden="true" />
          Add
        </Button>
      </div>
    </Section>
  );
}
