import type { Metric } from "@/lib/overview-metric";

export interface MetricRowProps {
  label: string;
  metric: Metric<string | number>;
}

// Read-only settings-style row; shared by every Overview metric.
export function MetricRow({ label, metric }: MetricRowProps) {
  const checked = metric.checkedAt.slice(11, 19);
  return (
    <div
      className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b py-2 last:border-b-0"
      style={{ borderColor: "var(--line)" }}
    >
      <dt className="text-sm text-fg">{label}</dt>
      <dd className="m-0 flex items-baseline gap-3">
        <span className="text-sm font-medium" style={{ color: metric.status === "ok" ? "var(--fg)" : "var(--fg-3)" }}>
          {metric.status === "ok" ? metric.value : "Unavailable"}
        </span>
        <time dateTime={metric.checkedAt} className="text-xs" style={{ color: "var(--fg-3)" }}>
          Checked {checked} UTC
        </time>
      </dd>
    </div>
  );
}
