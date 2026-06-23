"use client";

import Link from "next/link";
import { Share2, Pencil, MoreHorizontal, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConnectivityIndicator } from "@/components/packt/connectivity-indicator";

interface TripDetailCrumbProps {
  tripName: string;
  onEdit: () => void;
}

export function TripDetailCrumb({ tripName, onEdit }: TripDetailCrumbProps) {
  return (
    <div className="flex items-center gap-2 px-6 py-3" style={{ borderBottom: "1px solid var(--line)" }}>
      <Link
        href="/trips"
        className="inline-flex shrink-0 items-center gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] font-medium h-7 transition-colors hover:bg-muted"
        style={{ color: "var(--foreground)" }}
      >
        <ChevronLeft size={14} strokeWidth={1.5} />
        Trips
      </Link>
      <span style={{ color: "var(--fg-4)", fontSize: "calc(13px * var(--font-scale))" }}>/</span>
      <span style={{ fontSize: "calc(13px * var(--font-scale))", fontWeight: 500, color: "var(--fg)" }}>
        {tripName}
      </span>
      <span className="flex-1" />
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onEdit}>
          <Pencil size={13} strokeWidth={1.5} />
          Edit
        </Button>
        <Button variant="outline" size="sm">
          <Share2 size={13} strokeWidth={1.5} />
          Share
        </Button>
        <ConnectivityIndicator />
        <Button variant="outline" size="icon-sm" title="More options">
          <MoreHorizontal size={13} strokeWidth={1.5} />
        </Button>
      </div>
    </div>
  );
}
