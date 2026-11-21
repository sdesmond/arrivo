"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface PendingPackingListDelete {
  listId: string;
  listName: string;
  itemCount: number;
}

interface PackingListDeleteDialogProps {
  pendingDelete: PendingPackingListDelete | null;
  onConfirm: (listId: string) => void;
  onDismiss: () => void;
}

export function PackingListDeleteDialog({ pendingDelete, onConfirm, onDismiss }: PackingListDeleteDialogProps) {
  return (
    <AlertDialog
      open={pendingDelete !== null}
      onOpenChange={(open) => {
        if (!open) onDismiss();
      }}
    >
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete &ldquo;{pendingDelete?.listName}&rdquo;?</AlertDialogTitle>
          <AlertDialogDescription>
            This list contains {pendingDelete?.itemCount} {pendingDelete?.itemCount === 1 ? "item" : "items"}. Deleting
            it will permanently remove all items in the list.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              if (pendingDelete) onConfirm(pendingDelete.listId);
            }}
          >
            Delete List
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
