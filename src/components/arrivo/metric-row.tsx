import type { ReactNode } from "react";
import type { Metric } from "@/lib/overview-metric";

export interface MetricRowProps {
  label: string;
  metric: Metric<string | number>;
  format?: "bytes";
  controls?: ReactNode;
  stale?: boolean;
}

function formatBytes(bytes: number): string {
  const units = ["bytes", "KB", "MB", "GB", "TB", "PB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1000 && unitIndex < units.length - 1) {
    value /= 1000;
    unitIndex += 1;
  }
  return unitIndex === 0 ? `${bytes} bytes` : `${value.toFixed(2)} ${units[unitIndex]}`;
}

// Read-only metric card; shared by every Overview metric except the full-width admin actions list.
export function MetricRow({ label, metric, format, controls, stale }: MetricRowProps) {
  const bytes =
    metric.status === "ok" && format === "bytes" && typeof metric.value === "number" ? metric.value : undefined;
  return (
    <div
      className="flex min-h-40 min-w-0 flex-col rounded-lg border p-4"
      style={{ borderColor: "var(--line)", background: "var(--bg)" }}
    >
      <dt className="text-center text-sm wrap-anywhere" style={{ color: "var(--fg-2)" }}>
        {label}
      </dt>
      <dd className="m-0 flex min-w-0 flex-1 flex-col items-center gap-1">
        <span
          className="flex flex-1 items-center justify-center py-2 text-center font-semibold tabular-nums wrap-anywhere"
          title={bytes === undefined ? undefined : `${bytes} bytes`}
          style={{
            fontSize: "1.875rem",
            lineHeight: 1.2,
            color: metric.status === "ok" ? "var(--fg)" : "var(--fg-3)",
          }}
        >
          {metric.status === "ok" ? (bytes === undefined ? metric.value : formatBytes(bytes)) : "Unavailable"}
        </span>
        {stale ? (
          <span className="text-sm" style={{ color: "var(--fg-2)" }}>
            Stale
          </span>
        ) : null}
        <div className="flex w-full justify-end">{controls}</div>
      </dd>
    </div>
  );
}
