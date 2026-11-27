"use client";

import { useEffect, useState } from "react";
import { CircleArrowUp } from "lucide-react";
import type { AvailableUpdate } from "@/data/types";

function readUpdate(body: unknown): AvailableUpdate | null {
  const update = (body as { update?: Partial<AvailableUpdate> | null } | null)?.update;
  if (typeof update?.version !== "string" || typeof update.url !== "string") return null;
  return { version: update.version, url: update.url };
}

export function UpdateNotice() {
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/admin/update-status", { cache: "no-store", signal: controller.signal });
        if (response.ok) setUpdate(readUpdate(await response.json()));
      } catch {
        // The notice is optional; a failed check shows nothing.
      }
    }
    void load();
    return () => controller.abort();
  }, []);

  if (!update) return null;

  return (
    <div className="px-2 pb-2">
      <a
        href={update.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-h-11 items-center gap-2 rounded-md px-3 font-medium"
        style={{
          color: "var(--accent-ink)",
          background: "var(--accent-soft)",
          fontSize: "calc(13px * var(--font-scale))",
        }}
      >
        <CircleArrowUp aria-hidden="true" size={16} strokeWidth={1.5} className="shrink-0" />
        Version {update.version} available
        <span className="sr-only">(opens in a new tab)</span>
      </a>
    </div>
  );
}
