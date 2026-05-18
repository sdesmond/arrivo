"use client";

import { useState, useTransition } from "react";
import { X, Plus } from "lucide-react";
import { Section } from "@/components/packt/form-section";
import { Button } from "@/components/ui/button";
import { addWishlistDestination, deleteWishlistDestination } from "./actions";
import type { WishlistDestination } from "@/data/types";

interface WishlistSectionProps {
  wishlistDestinations: WishlistDestination[];
}

export function WishlistSection({ wishlistDestinations }: WishlistSectionProps) {
  const [name, setName] = useState("");
  const [isAdding, startAdd] = useTransition();

  function handleAdd() {
    if (!name.trim()) return;
    const dest = name.trim();
    startAdd(async () => {
      await addWishlistDestination({ name: dest });
      setName("");
    });
  }

  function handleDelete(id: string) {
    startAdd(async () => {
      await deleteWishlistDestination(id);
    });
  }

  return (
    <Section title="Destination Wishlist">
      {wishlistDestinations.length > 0 && (
        <div className="flex flex-col gap-2">
          {wishlistDestinations.map((dest) => (
            <div key={dest.id} className="flex items-center gap-2">
              <span style={{ flex: 1, fontSize: 13, color: "var(--fg)" }}>{dest.name}</span>
              <button
                type="button"
                onClick={() => handleDelete(dest.id)}
                title="Remove"
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
          placeholder="e.g. Kyoto, Japan"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
          className="flex-1 rounded-[6px] px-2.5 py-1.5 text-[13px] outline-none transition-colors"
          style={{
            background: "var(--surface-2)",
            color: "var(--fg)",
            border: "1px solid var(--line)",
          }}
        />
        <Button size="sm" onClick={handleAdd} disabled={isAdding || !name.trim()}>
          <Plus size={14} strokeWidth={1.5} aria-hidden="true" />
          Add
        </Button>
      </div>
    </Section>
  );
}
