"use client";

import { useState, useTransition } from "react";
import { X, Plus, Copy } from "lucide-react";
import { toast } from "sonner";
import { Section } from "@/components/arrivo/form-section";
import { Button } from "@/components/ui/button";
import { addLoyaltyNumber, deleteLoyaltyNumber } from "./actions";
import type { LoyaltyNumber } from "@/data/types";
import { copyToClipboard } from "@/lib/clipboard";
import { FIELD_LIMITS } from "@/lib/validation-limits";

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

  function handleAdd() {
    if (!program.trim() || !memberNum.trim()) return;
    const prog = program.trim();
    const num = memberNum.trim();
    startAdd(async () => {
      try {
        await addLoyaltyNumber({ programName: prog, memberNumber: num });
        setProgram("");
        setMemberNum("");
      } catch {
        toast.error("Could not add loyalty number.");
      }
    });
  }

  function handleDelete(id: string) {
    startAdd(async () => {
      try {
        await deleteLoyaltyNumber(id);
      } catch {
        toast.error("Could not remove loyalty number.");
      }
    });
  }

  function handleCopy(ln: LoyaltyNumber) {
    void copyToClipboard(ln.memberNumber, "Could not copy member number.");
  }

  return (
    <Section title="Loyalty Numbers">
      {loyaltyNumbers.length > 0 && (
        <div className="flex flex-col gap-2">
          {loyaltyNumbers.map((loyaltyNumber) => (
            <div key={loyaltyNumber.id} className="flex items-center gap-2">
              <span style={{ flex: 1, fontSize: "calc(13px * var(--font-scale))", color: "var(--fg)" }}>
                {loyaltyNumber.programName}
              </span>
              <span
                style={{
                  fontSize: "calc(13px * var(--font-scale))",
                  fontFamily: "var(--font-mono-family, ui-monospace)",
                  color: "var(--fg-2)",
                }}
              >
                {loyaltyNumber.memberNumber}
              </span>
              <Button
                variant="ghost"
                size="icon-lg"
                type="button"
                onClick={() => handleCopy(loyaltyNumber)}
                title="Copy member number"
                aria-label="Copy member number"
                style={{ color: "var(--fg-4)" }}
              >
                <Copy size={14} strokeWidth={1.5} />
              </Button>
              <Button
                variant="ghost"
                size="icon-lg"
                type="button"
                onClick={() => handleDelete(loyaltyNumber.id)}
                title="Remove"
                aria-label={`Remove ${loyaltyNumber.programName}`}
                style={{ color: "var(--fg-4)" }}
              >
                <X size={14} strokeWidth={1.5} />
              </Button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Program name"
          value={program}
          maxLength={FIELD_LIMITS.loyaltyProgram}
          onChange={(event) => setProgram(event.target.value)}
          className="flex-1 rounded-[6px] px-2.5 py-1.5 outline-none transition-colors"
          style={INPUT_STYLE}
        />
        <input
          type="text"
          placeholder="Member #"
          value={memberNum}
          maxLength={FIELD_LIMITS.loyaltyNumber}
          onChange={(event) => setMemberNum(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") handleAdd();
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
