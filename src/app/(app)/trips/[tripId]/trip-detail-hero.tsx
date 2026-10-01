"use client";

import { useState, useTransition, type ReactElement } from "react";

import Link from "next/link";

import {
  ChevronLeft,
  Share2,
  Calendar,
  MapPin,
  FileText,
  Users,
  Pencil,
  MoreHorizontal,
  Trash2,
  Info,
  LogOut,
} from "lucide-react";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { TripCover } from "@/components/packt/trip-cover";

import { CoverAttributionDialog } from "@/components/packt/cover-attribution-dialog";

import { CoverImagePicker } from "@/components/packt/cover-image-picker";

import { removeTripCover, setTripCoverWithAttribution } from "@/app/(app)/trips/[tripId]/actions";

import { CollaboratorRole, type CoverImageSelection, type CoverType, type TripDetailPayload } from "@/data/types";

import { getTripStatus, getTripDays, formatDate, parseGraphicCover, pluralize } from "@/lib/utils";

interface TripDetailHeroProps {
  detail: TripDetailPayload;

  nowISO: string;

  dateFormat: string;

  onEdit: () => void;

  onShare?: () => void;

  onLeave?: () => void;
}

function getCoverType(coverImageUrl?: string): CoverType {
  if (!coverImageUrl || parseGraphicCover(coverImageUrl)) {
    return "graphic";
  }

  if (coverImageUrl.startsWith("/api/mapbox/static")) {
    return "map";
  }

  return "photo";
}

export function TripDetailHero({
  detail,
  nowISO,
  dateFormat,
  onEdit,
  onShare,
  onLeave,
}: TripDetailHeroProps): ReactElement {
  const now = new Date(nowISO);

  const { trip, days, unscheduledEvents, docs, collaborators, accessRole } = detail;

  const canEdit = accessRole !== CollaboratorRole.Viewer;
  const canManage = accessRole === CollaboratorRole.Manager;

  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const [isAttributionOpen, setIsAttributionOpen] = useState(false);

  const [isPending, startTransition] = useTransition();

  const eventCount = days.reduce((count, day) => count + day.events.length, 0) + unscheduledEvents.length;

  const dayTotal = trip.startDate && trip.endDate ? getTripDays(trip.startDate, trip.endDate) : days.length;

  const dayN =
    trip.startDate && dayTotal > 0
      ? Math.max(1, Math.min(getTripDays(trip.startDate, nowISO.slice(0, 10)), dayTotal))
      : 0;

  const status = getTripStatus(trip.startDate, trip.endDate, now);

  const heroStatusLabel = trip.startDate && trip.endDate ? `${status.toUpperCase()} TRIP` : "UNSCHEDULED TRIP";

  const heroDateLine =
    trip.startDate && trip.endDate
      ? `${formatDate(trip.startDate, dateFormat)} — ${formatDate(trip.endDate, dateFormat)}`
      : "";

  const coverType = getCoverType(trip.coverImageUrl);

  const canRemoveCover = coverType === "photo" || coverType === "map";

  const canShowAttribution = coverType === "photo" && !!trip.coverPhotographer;

  const showCoverMenu = canEdit;

  function handleCoverSelection(image: CoverImageSelection) {
    startTransition(async () => {
      try {
        await setTripCoverWithAttribution(
          trip.id,

          image.url,

          image.photographer || null,

          image.photographerUrl || null
        );

        setIsPickerOpen(false);
      } catch {
        toast.error("Could not save cover image");
      }
    });
  }

  function handleRemoveCover() {
    startTransition(async () => {
      try {
        await removeTripCover(trip.id);
      } catch {
        toast.error("Could not remove cover image");
      }
    });
  }

  return (
    <>
      {/* Crumb bar */}

      <div
        className="flex items-center gap-2 px-4 lg:px-6 py-2.5 shrink-0"
        style={{ borderBottom: "1px solid var(--line)" }}
      >
        <Link
          href="/trips"
          className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 font-medium h-7 transition-colors hover:bg-surface"
          style={{ fontSize: "0.8rem", color: "var(--fg)" }}
        >
          <ChevronLeft size={14} strokeWidth={1.5} />
          Trips
        </Link>

        <span style={{ color: "var(--fg-4)", fontSize: "calc(13px * var(--font-scale))" }}>/</span>

        <span style={{ fontSize: "calc(13px * var(--font-scale))", fontWeight: 500, color: "var(--fg)" }}>
          {trip.name}
        </span>

        <span className="flex-1" />

        <div className="flex items-center gap-2">
          {canEdit ? (
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Pencil size={13} strokeWidth={1.5} />
              Edit
            </Button>
          ) : null}

          {canManage && onShare ? (
            <Button variant="outline" size="sm" onClick={onShare}>
              <Share2 size={13} strokeWidth={1.5} />
              Share
            </Button>
          ) : null}

          {/* Self-exit for editors/viewers only — managers (including the creator) never get it. */}
          {!canManage && onLeave ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onLeave}
              aria-label={`Leave trip ${trip.name}`}
              style={{ minHeight: 44, minWidth: 44 }}
            >
              <LogOut size={13} strokeWidth={1.5} />
              Leave trip
            </Button>
          ) : null}
        </div>
      </div>

      {/* Hero */}

      <div className="relative shrink-0" style={{ minHeight: 260 }}>
        {showCoverMenu ? (
          <div className="absolute right-2 top-2 z-10">
            <DropdownMenu>
              <DropdownMenuTrigger
                title="Cover options"
                disabled={isPending}
                className="rounded-[6px] bg-black/25 p-2 text-white backdrop-blur-sm transition-colors hover:bg-black/45"
                onClick={(event) => {
                  event.stopPropagation();
                }}
              >
                <MoreHorizontal size={18} strokeWidth={1.5} />
              </DropdownMenuTrigger>

              <DropdownMenuContent
                side="bottom"
                align="end"
                className="rounded-xl shadow-3"
                style={{ background: "var(--bg)", border: "1px solid var(--line)" }}
              >
                {canEdit ? (
                  <DropdownMenuItem disabled={isPending} onClick={() => setIsPickerOpen(true)}>
                    <Pencil size={13} strokeWidth={1.5} />
                    Edit Cover
                  </DropdownMenuItem>
                ) : null}

                {canEdit && canRemoveCover ? (
                  <DropdownMenuItem variant="destructive" disabled={isPending} onClick={handleRemoveCover}>
                    <Trash2 size={13} strokeWidth={1.5} />
                    Remove Cover
                  </DropdownMenuItem>
                ) : null}

                {canShowAttribution ? (
                  <DropdownMenuItem disabled={isPending} onClick={() => setIsAttributionOpen(true)}>
                    <Info size={13} strokeWidth={1.5} />
                    Info
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}

        <TripCover
          name={trip.name}
          country=""
          metaTag={heroStatusLabel}
          showCity={false}
          style={{ minHeight: 260 }}
          coverImageUrl={trip.coverImageUrl}
          destinationCountry={trip.destinationCountry}
        />

        <div className="absolute inset-0 pointer-events-none" style={{ background: "var(--cover-scrim)" }} />

        <div className="absolute bottom-0 left-0 right-0 p-5 lg:p-6">
          <div
            style={{
              fontFamily: "var(--font-mono-family, ui-monospace)",

              fontSize: "calc(10.5px * var(--font-scale))",

              fontWeight: 500,

              letterSpacing: "0.08em",

              textTransform: "uppercase",

              color: "var(--cover-text-dim)",

              marginBottom: 6,
            }}
          >
            {heroDateLine}
          </div>

          <h1
            style={{
              fontFamily: "var(--font-heading-family, ui-sans-serif)",

              fontSize: "clamp(28px, 5vw, 40px)",

              fontWeight: 800,

              letterSpacing: "-0.03em",

              color: "var(--cover-text)",

              lineHeight: 1.05,

              marginBottom: 10,
            }}
          >
            {trip.name}
          </h1>

          <div
            className="flex items-center gap-4 flex-wrap"
            style={{ color: "var(--cover-text-sub)", fontSize: "calc(12.5px * var(--font-scale))" }}
          >
            <span className="flex items-center gap-1.5">
              <Calendar size={13} strokeWidth={1.5} />

              {dayTotal > 0
                ? `${dayTotal} ${pluralize(dayTotal, "day")}${status === "active" ? ` · day ${dayN} today` : ""}`
                : "0 days"}
            </span>

            <span className="flex items-center gap-1.5">
              <MapPin size={13} strokeWidth={1.5} />
              {eventCount} {pluralize(eventCount, "place")}
            </span>

            <span className="flex items-center gap-1.5">
              <FileText size={13} strokeWidth={1.5} />
              {docs.length} {pluralize(docs.length, "doc")}
            </span>

            <span className="flex items-center gap-1.5">
              <Users size={13} strokeWidth={1.5} />
              {collaborators.length} {pluralize(collaborators.length, "collaborator")}
            </span>
          </div>
        </div>
      </div>

      {isPickerOpen ? (
        <CoverImagePicker
          tripId={trip.id}
          destinationName={trip.destinationName}
          destinationCountry={trip.destinationCountry}
          currentCoverImageUrl={trip.coverImageUrl}
          onImageSelected={handleCoverSelection}
          onClose={() => setIsPickerOpen(false)}
        />
      ) : null}

      {trip.coverPhotographer ? (
        <CoverAttributionDialog
          open={isAttributionOpen}
          photographer={trip.coverPhotographer}
          photographerUrl={trip.coverPhotographerUrl}
          onClose={() => setIsAttributionOpen(false)}
        />
      ) : null}
    </>
  );
}
