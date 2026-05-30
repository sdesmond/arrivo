"use client";

import { XIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { CoverImagePickerUpload } from "./cover-image-picker-upload";
import { CoverImagePickerUrl } from "./cover-image-picker-url";
import { CoverImagePickerCustom } from "./cover-image-picker-custom";
import { CoverImagePickerSearchTab } from "./cover-image-picker-search-tab";

export interface CoverImagePickerProps {
  tripId: string;
  destinationName?: string;
  destinationCountry?: string;
  center?: [number, number];
  onImageSelected: (url: string) => void;
  onClose: () => void;
}

export function CoverImagePicker({ tripId, destinationName, center, onImageSelected, onClose }: CoverImagePickerProps) {
  function handleSelect(url: string) {
    onImageSelected(url);
    onClose();
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-2xl flex flex-col overflow-hidden"
        style={{ maxHeight: "calc(100vh - 2rem)" }}
      >
        <DialogHeader className="flex-row items-center justify-between">
          <DialogTitle>Cover Image</DialogTitle>
          <Button variant="ghost" size="icon-sm" title="Close" aria-label="Close" onClick={onClose}>
            <XIcon strokeWidth={1.5} />
          </Button>
        </DialogHeader>

        <Tabs defaultValue="search" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="shrink-0">
            <TabsTrigger value="search">Search</TabsTrigger>
            <TabsTrigger value="upload">Upload</TabsTrigger>
            <TabsTrigger value="url">URL</TabsTrigger>
            <TabsTrigger value="custom">Custom</TabsTrigger>
          </TabsList>

          <TabsContent value="search" className="min-h-0 flex-1 overflow-y-auto">
            <CoverImagePickerSearchTab
              key={tripId}
              destinationName={destinationName}
              center={center}
              onImageSelected={handleSelect}
            />
          </TabsContent>
          <TabsContent value="upload" className="min-h-0 flex-1 overflow-y-auto">
            <CoverImagePickerUpload tripId={tripId} onImageSelected={onImageSelected} onClose={onClose} />
          </TabsContent>
          <TabsContent value="url" className="min-h-0 flex-1 overflow-y-auto">
            <CoverImagePickerUrl onImageSelected={onImageSelected} onClose={onClose} />
          </TabsContent>
          <TabsContent value="custom" className="min-h-0 flex-1 overflow-y-auto">
            <CoverImagePickerCustom onImageSelected={onImageSelected} onClose={onClose} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
