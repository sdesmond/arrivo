"use client";

import type { ReactElement } from "react";
import { Badge } from "@/components/ui/badge";

export function LinkedEventBadge(): ReactElement {
  return (
    <Badge
      variant="secondary"
      aria-hidden="true"
      style={{ height: 18, padding: "0 7px", borderRadius: 9999, fontSize: 10, fontWeight: 500 }}
    >
      Linked
    </Badge>
  );
}
