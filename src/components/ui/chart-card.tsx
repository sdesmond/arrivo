import type { ReactElement, ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface ChartCardProps {
  children: ReactNode;
  className?: string;
}

export function ChartCard({ children, className }: ChartCardProps): ReactElement {
  return (
    <div
      data-slot="chart-card"
      className={cn("rounded-xl border p-4", className)}
      style={{ background: "var(--surface)", borderColor: "var(--line)" }}
    >
      {children}
    </div>
  );
}
