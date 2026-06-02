"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createTemplate, deleteTemplate, renameTemplate } from "./actions";
import { DeleteTemplateAlertDialog } from "@/components/packt/delete-template-alert-dialog";
import { TemplateFormDialog } from "@/components/packt/template-form-dialog";
import { TemplateLibrary } from "@/components/packt/template-library";
import type { PackingTemplate } from "@/data/types";

export interface TemplatesPageClientProps {
  templates: PackingTemplate[];
}

function getActionErrorMessage(error: unknown, fallbackMessage: string): string {
  return error instanceof Error && error.message ? error.message : fallbackMessage;
}

export function TemplatesPageClient({ templates }: TemplatesPageClientProps) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [renamingTemplate, setRenamingTemplate] = useState<PackingTemplate | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState<PackingTemplate | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCreate(name: string) {
    startTransition(async () => {
      try {
        await createTemplate({ name });
        setCreateDialogOpen(false);
      } catch (error) {
        toast.error(getActionErrorMessage(error, "Could not create template"));
      }
    });
  }

  function handleRename(name: string) {
    if (!renamingTemplate) return;

    const current = renamingTemplate;
    startTransition(async () => {
      try {
        await renameTemplate(current.id, { name });
        setRenamingTemplate((prev) => (prev === current ? null : prev));
      } catch (error) {
        toast.error(getActionErrorMessage(error, "Could not rename template"));
      }
    });
  }

  function handleDelete() {
    if (!deletingTemplate) return;

    const current = deletingTemplate;
    startTransition(async () => {
      try {
        await deleteTemplate(current.id);
        setDeletingTemplate((prev) => (prev === current ? null : prev));
      } catch (error) {
        toast.error(getActionErrorMessage(error, "Could not delete template"));
      }
    });
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
