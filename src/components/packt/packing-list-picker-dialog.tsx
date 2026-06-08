"use client";

import type { ReactElement } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { TripPackingList, PackingTemplate } from "@/data/types";

export interface PackingListPickerDialogProps {
  open: boolean;
  onClose: () => void;
  packingLists: TripPackingList[];
  templates: PackingTemplate[];
  onSelect: (sourceType: "packing-list" | "template", sourceId: string) => void;
}

export function PackingListPickerDialog({
  open,
  onClose,
  packingLists,
  templates,
  onSelect,
}: PackingListPickerDialogProps): ReactElement {
  const isEmpty = packingLists.length === 0 && templates.length === 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Insert packing list</DialogTitle>
        </DialogHeader>

        {isEmpty ? (
          <p
            style={{
              fontSize: "calc(13px * var(--font-scale))",
              color: "var(--fg-3)",
              textAlign: "center",
              padding: "16px 0",
            }}
          >
            No packing lists or templates yet
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {packingLists.length > 0 && (
              <section>
                <p
                  style={{
                    fontSize: "calc(11px * var(--font-scale))",
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "var(--fg-3)",
                    marginBottom: 6,
                  }}
                >
                  Trip Packing Lists
                </p>
                <div className="flex flex-col">
                  {packingLists.map((list) => (
                    <button
                      key={list.id}
                      onClick={() => {
                        onSelect("packing-list", list.id);
                        onClose();
                      }}
                      className="flex items-center rounded-lg px-3 transition-colors hover:bg-surface text-left"
                      style={{
                        minHeight: "2.75rem",
                        fontSize: "calc(13.5px * var(--font-scale))",
                        color: "var(--fg)",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      {list.name}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {templates.length > 0 && (
              <section>
                <p
                  style={{
                    fontSize: "calc(11px * var(--font-scale))",
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "var(--fg-3)",
                    marginBottom: 6,
                  }}
                >
                  Templates
                </p>
                <div className="flex flex-col">
                  {templates.map((template) => (
                    <button
                      key={template.id}
                      onClick={() => {
                        onSelect("template", template.id);
                        onClose();
                      }}
                      className="flex items-center rounded-lg px-3 transition-colors hover:bg-surface text-left"
                      style={{
                        minHeight: "2.75rem",
                        fontSize: "calc(13.5px * var(--font-scale))",
                        color: "var(--fg)",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      {template.name}
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
