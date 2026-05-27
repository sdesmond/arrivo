"use client";

import { Check, Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RailPanel } from "./rail-panel";

export interface DocRailItem {
  name: string;
  subtitle?: string;
  cached: boolean;
}

interface DocsRailProps {
  docs: DocRailItem[];
}

export function DocsRail({ docs }: DocsRailProps) {
  const offlineCount = docs.filter((d) => d.cached).length;
  return (
    <RailPanel header="Documents" meta={`${offlineCount} / ${docs.length} OFFLINE`}>
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
            {doc.cached ? (
              <span style={{ color: "var(--accent-brand)", flexShrink: 0 }}>
                <Check size={15} strokeWidth={2} />
              </span>
            ) : (
              <button style={{ color: "var(--fg-3)", flexShrink: 0 }} title="Save offline">
                <Download size={15} strokeWidth={1.5} />
              </button>
            )}
          </div>
        ))}
      </div>
      <Button variant="ghost" size="sm" className="w-full mt-2">
        View all {docs.length} documents →
      </Button>
    </RailPanel>
  );
}
