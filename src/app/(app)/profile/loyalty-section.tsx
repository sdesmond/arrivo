"use client";

import { useState, useTransition } from "react";
import { X, Plus, Copy, Check } from "lucide-react";
import { Section } from "@/components/packt/form-section";
import { Button } from "@/components/ui/button";
import { addLoyaltyNumber, deleteLoyaltyNumber } from "./actions";
import type { LoyaltyNumber } from "@/data/types";

interface LoyaltySectionProps {
  loyaltyNumbers: LoyaltyNumber[];
}

const INPUT_STYLE: React.CSSProperties = {
  background: "var(--surface-2)",
  color: "var(--fg)",
  border: "1px solid var(--line)",
  fontSize: "calc(13px * var(--font-scale))",
};

export function LoyaltySection({ loyaltyNumbers }: LoyaltySectionProps) {
  const [program, setProgram] = useState("");
  const [memberNum, setMemberNum] = useState("");
  const [isAdding, startAdd] = useTransition();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function handleAdd() {
    if (!program.trim() || !memberNum.trim()) return;
    const prog = program.trim();
    const num = memberNum.trim();
    startAdd(async () => {
      await addLoyaltyNumber({ programName: prog, memberNumber: num });
      setProgram("");
      setMemberNum("");
    });
  }

  function handleDelete(id: string) {
    startAdd(async () => {
      await deleteLoyaltyNumber(id);
    });
  }

  function handleCopy(ln: LoyaltyNumber) {
    navigator.clipboard.writeText(ln.memberNumber);
    setCopiedId(ln.id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  return (
    <Section title="Loyalty Numbers">
      {loyaltyNumbers.length > 0 && (
        <div className="flex flex-col gap-2">
          {loyaltyNumbers.map((ln) => (
            <div key={ln.id} className="flex items-center gap-2">
              <span style={{ flex: 1, fontSize: "calc(13px * var(--font-scale))", color: "var(--fg)" }}>
                {ln.programName}
              </span>
              <span
                style={{
                  fontSize: "calc(13px * var(--font-scale))",
                  fontFamily: "var(--font-mono-family, ui-monospace)",
                  color: "var(--fg-2)",
                }}
              >
                {ln.memberNumber}
              </span>
              <button
                type="button"
                onClick={() => handleCopy(ln)}
                title={copiedId === ln.id ? "Copied!" : "Copy member number"}
                aria-label={copiedId === ln.id ? "Copied!" : "Copy member number"}
                className="rounded-[4px] p-0.5 transition-colors hover:bg-surface-3"
                style={{ color: "var(--fg-4)" }}
              >
                {copiedId === ln.id ? <Check size={14} strokeWidth={1.5} /> : <Copy size={14} strokeWidth={1.5} />}
              </button>
              <button
                type="button"
                onClick={() => handleDelete(ln.id)}
                title="Remove"
                aria-label={`Remove ${ln.programName}`}
                className="rounded-[4px] p-0.5 transition-colors hover:bg-surface-3"
                style={{ color: "var(--fg-4)" }}
              >
                <X size={14} strokeWidth={1.5} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Program name"
          value={program}
          onChange={(e) => setProgram(e.target.value)}
          className="flex-1 rounded-[6px] px-2.5 py-1.5 outline-none transition-colors"
          style={INPUT_STYLE}
        />
        <input
          type="text"
          placeholder="Member #"
          value={memberNum}
          onChange={(e) => setMemberNum(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
          className="w-28 rounded-[6px] px-2.5 py-1.5 outline-none transition-colors"
          style={INPUT_STYLE}
        />
        <Button size="sm" onClick={handleAdd} disabled={isAdding || !program.trim() || !memberNum.trim()}>
          <Plus size={14} strokeWidth={1.5} aria-hidden="true" />
          Add
        </Button>
      </div>
    </Section>
  );
}
