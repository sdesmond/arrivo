"use client";

import { XIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { CoverImagePickerUpload } from "./cover-image-picker-upload";
import { CoverImagePickerUrl } from "./cover-image-picker-url";
import { CoverImagePickerCustom } from "./cover-image-picker-custom";
import { CoverImagePickerSearchTab } from "./cover-image-picker-search-tab";
import { GRAPHIC_COVER_COLORS, GRAPHIC_COVER_ICONS, GRAPHIC_COVER_PATTERNS, parseGraphicCover } from "@/lib/utils";
import type { CoverImageSelection } from "@/data/types";

export interface CoverImagePickerProps {
  tripId: string;
  destinationName?: string;
  destinationCountry?: string;
  center?: [number, number];
  currentCoverImageUrl?: string;
  onImageSelected: (image: CoverImageSelection) => void;
  onClose: () => void;
}

export function CoverImagePicker({
  tripId,
  destinationName,
  center,
  currentCoverImageUrl,
  onImageSelected,
  onClose,
}: CoverImagePickerProps) {
  function handleSelect(selected: string | CoverImageSelection) {
    const image = typeof selected === "string" ? { url: selected } : selected;
    onImageSelected(image);
    onClose();
  }

  const graphicCover = currentCoverImageUrl ? parseGraphicCover(currentCoverImageUrl) : null;
  const defaultTab = graphicCover ? "custom" : "search";

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

        <Tabs defaultValue={defaultTab} className="flex min-h-0 flex-1 flex-col">
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
            <CoverImagePickerUpload tripId={tripId} onImageSelected={handleSelect} onClose={onClose} />
          </TabsContent>
          <TabsContent value="url" className="min-h-0 flex-1 overflow-y-auto">
            <CoverImagePickerUrl onImageSelected={handleSelect} onClose={onClose} />
          </TabsContent>
          <TabsContent value="custom" className="min-h-0 flex-1 overflow-y-auto">
            <CoverImagePickerCustom
              onImageSelected={handleSelect}
              onClose={onClose}
              defaultColor={graphicCover?.color as (typeof GRAPHIC_COVER_COLORS)[number] | undefined}
              defaultPattern={graphicCover?.pattern as (typeof GRAPHIC_COVER_PATTERNS)[number] | undefined}
              defaultIcon={graphicCover?.icon as (typeof GRAPHIC_COVER_ICONS)[number] | undefined}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
