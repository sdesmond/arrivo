"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { XIcon, LoaderIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { searchCoverImages } from "@/app/(app)/trips/actions";
import { CoverImagePickerUpload } from "./cover-image-picker-upload";
import { CoverImagePickerUrl } from "./cover-image-picker-url";
import { CoverImagePickerCustom } from "./cover-image-picker-custom";

interface CoverImageResult {
  id: string;
  url: string;
  photographer: string;
  alt: string;
}

export interface CoverImagePickerProps {
  tripId: string;
  destinationName?: string;
  destinationCountry?: string;
  center?: [number, number];
  onImageSelected: (url: string) => void;
  onClose: () => void;
}

function buildMapTileUrl(center?: [number, number]) {
  if (!center) {
    return null;
  }

  const searchParams = new URLSearchParams({
    lng: center[0].toString(),
    lat: center[1].toString(),
  });

  return `/api/mapbox/static?${searchParams.toString()}`;
}

export function CoverImagePicker({ tripId, destinationName, center, onImageSelected, onClose }: CoverImagePickerProps) {
  const [images, setImages] = useState<CoverImageResult[]>([]);
  const [hiddenImageIds, setHiddenImageIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [failedMapTileUrl, setFailedMapTileUrl] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;
    const query = destinationName?.trim();

    /* eslint-disable react-hooks/set-state-in-effect */
    setImages([]);
    setHiddenImageIds([]);
    setHasError(false);
    setLoading(false);
    /* eslint-enable react-hooks/set-state-in-effect */

    if (!query) {
      return () => {
        isCurrent = false;
      };
    }

    setLoading(true);
    searchCoverImages(query)
      .then((results) => {
        if (!isCurrent) {
          return;
        }

        setImages(results);
      })
      .catch(() => {
        if (!isCurrent) {
          return;
        }

        toast.error("Could not load images");
        setHasError(true);
      })
      .finally(() => {
        if (!isCurrent) {
          return;
        }

        setLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [destinationName]);

  const mapTileUrl = buildMapTileUrl(center);

  function handleSelect(url: string) {
    onImageSelected(url);
    onClose();
  }

  const visibleImages = images.filter((item) => !hiddenImageIds.includes(item.id));
  const showMapTile = !hasError && !!mapTileUrl && failedMapTileUrl !== mapTileUrl;
  const showEmptyState = !loading && (hasError || (visibleImages.length === 0 && !showMapTile));

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent showCloseButton={false} className="sm:max-w-2xl">
        <DialogHeader className="flex-row items-center justify-between">
          <DialogTitle>Cover Image</DialogTitle>
          <Button variant="ghost" size="icon-sm" title="Close" aria-label="Close" onClick={onClose}>
            <XIcon strokeWidth={1.5} />
          </Button>
        </DialogHeader>

        <Tabs defaultValue="search">
          <TabsList>
            <TabsTrigger value="search">Search</TabsTrigger>
            <TabsTrigger value="upload">Upload</TabsTrigger>
            <TabsTrigger value="url">URL</TabsTrigger>
            <TabsTrigger value="custom">Custom</TabsTrigger>
          </TabsList>

          <TabsContent value="search">
            {loading ? (
              <div
                role="status"
                aria-label="Loading images"
                style={{ display: "flex", justifyContent: "center", padding: 32 }}
              >
                <LoaderIcon strokeWidth={1.5} className="animate-spin" />
                <span className="sr-only">Loading images…</span>
              </div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, paddingTop: 8 }}>
                {showMapTile && mapTileUrl && (
                  <button
                    type="button"
                    title="Map view"
                    aria-label={`Map view of ${destinationName ?? ""}`}
                    onClick={() => handleSelect(mapTileUrl)}
                    style={{
                      position: "relative",
                      border: "1px solid var(--line)",
                      borderRadius: 4,
                      overflow: "hidden",
                      background: "none",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={mapTileUrl}
                      alt={`Map view of ${destinationName ?? ""}`}
                      style={{ display: "block", objectFit: "cover", width: 200, height: 134 }}
                      onError={() => {
                        setFailedMapTileUrl(mapTileUrl);
                      }}
                    />
                    <span
                      style={{
                        position: "absolute",
                        bottom: 4,
                        left: 4,
                        fontSize: 11,
                        color: "var(--fg)",
                        background: "var(--surface)",
                        padding: "1px 4px",
                        borderRadius: 2,
                        pointerEvents: "none",
                      }}
                    >
                      Map view
                    </span>
                  </button>
                )}
                {!hasError &&
                  visibleImages.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      title={item.photographer}
                      aria-label={item.alt || item.photographer}
                      onClick={() => handleSelect(item.url)}
                      style={{
                        border: "none",
                        padding: 0,
                        cursor: "pointer",
                        borderRadius: 4,
                        overflow: "hidden",
                        background: "none",
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.url}
                        alt={item.alt}
                        style={{ display: "block", objectFit: "cover", width: 100, height: 100 }}
                        onError={() => {
                          setHiddenImageIds((currentIds) =>
                            currentIds.includes(item.id) ? currentIds : [...currentIds, item.id]
                          );
                        }}
                      />
                    </button>
                  ))}
                {showEmptyState && (
                  <div className="p-4 text-center" style={{ color: "var(--fg-3)", width: "100%" }}>
                    No images found
                  </div>
                )}
              </div>
            )}
          </TabsContent>
          <TabsContent value="upload">
            <CoverImagePickerUpload tripId={tripId} onImageSelected={onImageSelected} onClose={onClose} />
          </TabsContent>
          <TabsContent value="url">
            <CoverImagePickerUrl onImageSelected={onImageSelected} onClose={onClose} />
          </TabsContent>
          <TabsContent value="custom">
            <CoverImagePickerCustom onImageSelected={onImageSelected} onClose={onClose} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
