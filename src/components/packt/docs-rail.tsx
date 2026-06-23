"use client";

import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RailPanel } from "./rail-panel";
import { pluralize } from "@/lib/utils";

export interface DocRailItem {
  name: string;
  subtitle?: string;
}

interface DocsRailProps {
  docs: DocRailItem[];
}

export function DocsRail({ docs }: DocsRailProps) {
  return (
    <RailPanel header="Documents">
      <div className="flex flex-col gap-0.5">
        {docs.slice(0, 5).map((doc, idx) => (
          <div
            key={idx}
            className="flex items-center gap-2.5 rounded-[6px] px-2 py-1.5 transition-colors hover:bg-surface"
            style={{ cursor: "pointer" }}
          >
            <span style={{ color: "var(--fg-3)", flexShrink: 0 }}>
              <FileText size={14} strokeWidth={1.5} />
            </span>
            <div className="flex-1 min-w-0">
              <div
                style={{
                  fontSize: "calc(12.5px * var(--font-scale))",
                  fontWeight: 500,
                  color: "var(--fg)",
                  lineHeight: 1.2,
                }}
                className="truncate"
              >
                {doc.name}
              </div>
              {doc.subtitle && (
                <div style={{ fontSize: "calc(11px * var(--font-scale))", color: "var(--fg-4)" }}>{doc.subtitle}</div>
              )}
            </div>
          </div>
        ))}
      </div>
      <Button variant="ghost" size="sm" className="w-full mt-2">
        View all {pluralize(docs.length, "document")} →
      </Button>
    </RailPanel>
  );
}
