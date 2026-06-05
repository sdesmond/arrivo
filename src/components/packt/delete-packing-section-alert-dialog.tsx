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

export interface DeletePackingSectionAlertDialogProps {
  sectionName: string;
  itemCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMoveItems: () => void | Promise<void>;
  onDeleteItems: () => void | Promise<void>;
  isDeleting?: boolean;
}

export function DeletePackingSectionAlertDialog({
  sectionName,
  itemCount,
  open,
  onOpenChange,
  onMoveItems,
  onDeleteItems,
  isDeleting = false,
}: DeletePackingSectionAlertDialogProps) {
  const itemLabel = itemCount === 1 ? "item" : "items";

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent size="default">
        <AlertDialogHeader className="place-items-start text-left">
          <AlertDialogTitle>Delete {sectionName}?</AlertDialogTitle>
          <AlertDialogDescription className="text-left">
            This section has {itemCount} {itemLabel}. Move {itemCount === 1 ? "it" : "them"} to Ungrouped, or delete{" "}
            {itemCount === 1 ? "it" : "them"} with the section?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="grid-cols-2 sm:grid-cols-3" style={{ display: "grid" }}>
          <AlertDialogAction
            variant="outline"
            disabled={isDeleting}
            onClick={() => {
              void onMoveItems();
            }}
          >
            {isDeleting ? "Working..." : "Keep Items"}
          </AlertDialogAction>
          <AlertDialogAction
            variant="destructive"
            disabled={isDeleting}
            onClick={() => {
              void onDeleteItems();
            }}
          >
            {isDeleting ? "Working..." : "Delete Items"}
          </AlertDialogAction>
          <AlertDialogCancel variant="ghost" className="col-span-2 sm:col-span-1 sm:order-first" disabled={isDeleting}>
            Cancel
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
