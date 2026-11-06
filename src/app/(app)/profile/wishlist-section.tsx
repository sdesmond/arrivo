"use client";

import { useState, useTransition } from "react";
import { X, Plus } from "lucide-react";
import { toast } from "sonner";
import { Section } from "@/components/arrivo/form-section";
import { Button } from "@/components/ui/button";
import { addWishlistDestination, deleteWishlistDestination } from "./actions";
import type { WishlistDestination } from "@/data/types";
import { FIELD_LIMITS } from "@/lib/validation-limits";

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
      try {
        await addWishlistDestination({ name: dest });
        setName("");
      } catch {
        toast.error("Could not add destination.");
      }
    });
  }

  function handleDelete(id: string) {
    startAdd(async () => {
      try {
        await deleteWishlistDestination(id);
      } catch {
        toast.error("Could not remove destination.");
      }
    });
  }

  return (
    <Section title="Destination Wishlist">
      {wishlistDestinations.length > 0 && (
        <div className="flex flex-col gap-2">
          {wishlistDestinations.map((dest) => (
            <div key={dest.id} className="flex items-center gap-2">
              <span style={{ flex: 1, fontSize: "calc(13px * var(--font-scale))", color: "var(--fg)" }}>
                {dest.name}
              </span>
              <Button
                variant="ghost"
                size="icon-lg"
                type="button"
                onClick={() => handleDelete(dest.id)}
                title="Remove"
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
          placeholder="e.g. Kyoto, Japan"
          value={name}
          maxLength={FIELD_LIMITS.wishlistDestination}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") handleAdd();
          }}
          className="flex-1 rounded-[6px] px-2.5 py-1.5 outline-none transition-colors"
          style={{
            background: "var(--surface-2)",
            color: "var(--fg)",
            border: "1px solid var(--line)",
            fontSize: "calc(13px * var(--font-scale))",
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
