import type { ReactElement, ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface ChartCardProps {
  children: ReactNode;
  className?: string;
  title?: string;
}

export function ChartCard({ children, className, title }: ChartCardProps): ReactElement {
  return (
    <div
      data-slot="chart-card"
      className={cn("rounded-xl border p-4", className)}
      style={{ background: "var(--surface)", borderColor: "var(--line)" }}
    >
      {title ? (
        <h3
          className="mb-3"
          style={{
            fontFamily: "var(--font-heading-family, ui-sans-serif)",
            fontSize: "calc(var(--fs-card-title) * var(--font-scale))",
            fontWeight: 600,
            color: "var(--fg)",
          }}
        >
          {title}
        </h3>
      ) : null}
      {children}
    </div>
  );
}
