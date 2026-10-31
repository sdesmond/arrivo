import type { Metric } from "@/lib/overview-metric";

export interface MetricRowProps {
  label: string;
  metric: Metric<string | number>;
  format?: "bytes";
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

// Read-only settings-style row; shared by every Overview metric.
export function MetricRow({ label, metric, format }: MetricRowProps) {
  const checked = metric.checkedAt.slice(11, 19);
  const bytes =
    metric.status === "ok" && format === "bytes" && typeof metric.value === "number" ? metric.value : undefined;
  return (
    <div
      className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b py-2 last:border-b-0"
      style={{ borderColor: "var(--line)" }}
    >
      <dt className="text-sm text-fg">{label}</dt>
      <dd className="m-0 flex items-baseline gap-3">
        <span
          className="text-sm font-medium"
          title={bytes === undefined ? undefined : `${bytes} bytes`}
          style={{ color: metric.status === "ok" ? "var(--fg)" : "var(--fg-3)" }}
        >
          {metric.status === "ok" ? (bytes === undefined ? metric.value : formatBytes(bytes)) : "Unavailable"}
        </span>
        <time dateTime={metric.checkedAt} className="text-xs" style={{ color: "var(--fg-3)" }}>
          Checked {checked} UTC
        </time>
      </dd>
    </div>
  );
}
