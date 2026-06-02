"use client";

import { LayoutTemplate, PencilLine, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import type { PackingTemplate } from "@/data/types";

export interface TemplateLibraryProps {
  templates: PackingTemplate[];
  onNew: () => void;
  onRename: (template: PackingTemplate) => void;
  onDelete: (template: PackingTemplate) => void;
}

export function TemplateLibrary({ templates, onNew, onRename, onDelete }: TemplateLibraryProps) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1
            style={{
              fontFamily: "var(--font-heading-family, ui-sans-serif)",
              fontSize: "calc(22px * var(--font-scale))",
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "var(--fg)",
            }}
          >
            Packing Templates
          </h1>
          <p style={{ color: "var(--fg-3)", fontSize: "calc(14px * var(--font-scale))" }}>
            Saving reusable packing setups for future trips.
          </p>
        </div>
        <Button type="button" size="lg" onClick={onNew} style={{ minHeight: 44 }}>
          <Plus strokeWidth={1.5} />
          New template
        </Button>
      </div>

      {templates.length === 0 ? (
        <Empty style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LayoutTemplate strokeWidth={1.5} />
            </EmptyMedia>
            <EmptyTitle>No templates yet</EmptyTitle>
            <EmptyDescription>
              Create your first packing template and reuse it when the next trip shows up on the calendar.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button type="button" onClick={onNew} style={{ minHeight: 44 }}>
              Create first template
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <ul className="flex flex-col gap-3">
          {templates.map((template) => (
            <li
              key={template.id}
              className="flex items-center gap-3 rounded-xl border px-4 py-3"
              style={{ borderColor: "var(--line)", background: "var(--surface)" }}
            >
              <div className="min-w-0 flex-1">
                <p
                  className="truncate"
                  style={{
                    color: "var(--fg)",
                    fontFamily: "var(--font-body, ui-sans-serif)",
                    fontSize: "calc(15px * var(--font-scale))",
                    fontWeight: 600,
                  }}
                >
                  {template.name}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  title={`Rename ${template.name}`}
                  aria-label={`Rename ${template.name}`}
                  onClick={() => onRename(template)}
                  style={{ minWidth: 44, minHeight: 44 }}
                >
                  <PencilLine strokeWidth={1.5} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  title={`Delete ${template.name}`}
                  aria-label={`Delete ${template.name}`}
                  onClick={() => onDelete(template)}
                  style={{ minWidth: 44, minHeight: 44 }}
                >
                  <Trash2 strokeWidth={1.5} />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
