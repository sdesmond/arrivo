"use client";

import { useRef, useState } from "react";
import { DeleteTemplateAlertDialog } from "@/components/arrivo/delete-template-alert-dialog";
import { TemplateFormDialog } from "@/components/arrivo/template-form-dialog";
import { TemplateLibrary } from "@/components/arrivo/template-library";
import type { PackingTemplate } from "@/data/types";
import {
  createPackingTemplate,
  renamePackingTemplate,
  deletePackingTemplate,
} from "@/lib/api/contract/packing-templates";
import { useApiMutation } from "@/lib/api/use-api-mutation";
import { createRandomId } from "@/lib/utils";

export interface TemplatesPageClientProps {
  templates: PackingTemplate[];
}

export function TemplatesPageClient({ templates }: TemplatesPageClientProps) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [renamingTemplate, setRenamingTemplate] = useState<PackingTemplate | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState<PackingTemplate | null>(null);
  const rename = useApiMutation(renamePackingTemplate);
  const remove = useApiMutation(deletePackingTemplate);
  const creation = useApiMutation(createPackingTemplate);
  const isPending = rename.isPending || remove.isPending || creation.isPending;
  // A retry of the same draft reuses its id, so the server sees one template however many times it is sent.
  const draftId = useRef<{ name: string; id: string } | null>(null);

  function handleCreate(name: string) {
    const draftName = name.trim();
    if (draftId.current?.name !== draftName) draftId.current = { name: draftName, id: createRandomId() };
    return creation.mutate(
      { params: {}, body: { id: draftId.current.id, name } },
      {
        onSuccess: () => {
          draftId.current = null;
          setCreateDialogOpen(false);
        },
      }
    );
  }

  function handleRename(name: string) {
    if (!renamingTemplate) return;

    const current = renamingTemplate;
    return rename.mutate(
      { params: { templateId: current.id }, body: { name } },
      { onSuccess: () => setRenamingTemplate((prev) => (prev === current ? null : prev)) }
    );
  }

  function handleDelete() {
    if (!deletingTemplate) return;

    const current = deletingTemplate;
    return remove.mutate(
      { params: { templateId: current.id }, body: {} },
      { onSuccess: () => setDeletingTemplate((prev) => (prev === current ? null : prev)) }
    );
  }

  return (
    <>
      <TemplateLibrary
        templates={templates}
        onNew={() => setCreateDialogOpen(true)}
        onRename={setRenamingTemplate}
        onDelete={setDeletingTemplate}
      />
      {createDialogOpen ? (
        <TemplateFormDialog
          key="create-template-dialog"
          mode="create"
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          onSubmit={handleCreate}
          isPending={isPending}
        />
      ) : null}
      {renamingTemplate ? (
        <TemplateFormDialog
          key={renamingTemplate.id}
          mode="rename"
          initialName={renamingTemplate.name}
          open
          onOpenChange={(open) => {
            if (!open) {
              setRenamingTemplate(null);
            }
          }}
          onSubmit={handleRename}
          isPending={isPending}
        />
      ) : null}
      {deletingTemplate ? (
        <DeleteTemplateAlertDialog
          templateName={deletingTemplate.name}
          open
          onOpenChange={(open) => {
            if (!open) {
              setDeletingTemplate(null);
            }
          }}
          onConfirm={handleDelete}
          isDeleting={isPending}
        />
      ) : null}
    </>
  );
}
