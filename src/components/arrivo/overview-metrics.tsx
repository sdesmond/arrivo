"use client";

import type { ActivityEventSummary } from "@/data/types";
import type { Metric } from "@/lib/overview-metric";
import {
  refreshVersion,
  refreshDatabase,
  refreshStorage,
  refreshUploadBytes,
  refreshUsers,
  refreshAdmins,
  refreshPending,
  refreshTrips,
  refreshDocuments,
  refreshFailedSignIns,
  refreshAdminActions,
} from "@/app/(app)/admin/overview/actions";
import { MetricRow } from "./metric-row";
import { RecentAdminActions } from "./recent-admin-actions";
import { RefreshableMetric } from "./refreshable-metric";

export interface OverviewMetricsProps {
  version: Metric<string>;
  database: Metric<string>;
  storage: Metric<string>;
  uploadBytes: Metric<number>;
  users: Metric<number>;
  admins: Metric<number>;
  pending: Metric<number>;
  trips: Metric<number>;
  documents: Metric<number>;
  failedSignIns: Metric<number>;
  adminActions: Metric<ActivityEventSummary[]>;
}

export function OverviewMetrics({
  version,
  database,
  storage,
  uploadBytes,
  users,
  admins,
  pending,
  trips,
  documents,
  failedSignIns,
  adminActions,
}: OverviewMetricsProps) {
  const rows: {
    label: string;
    initialMetric: Metric<string | number>;
    refresh: () => Promise<Metric<string | number>>;
    format?: "bytes";
  }[] = [
    { label: "Version", initialMetric: version, refresh: refreshVersion },
    { label: "Database", initialMetric: database, refresh: refreshDatabase },
    { label: "Document storage", initialMetric: storage, refresh: refreshStorage },
    { label: "Upload storage", initialMetric: uploadBytes, refresh: refreshUploadBytes, format: "bytes" },
    { label: "Users", initialMetric: users, refresh: refreshUsers },
    { label: "Admins", initialMetric: admins, refresh: refreshAdmins },
    { label: "Pending setup", initialMetric: pending, refresh: refreshPending },
    { label: "Trips", initialMetric: trips, refresh: refreshTrips },
    { label: "Documents", initialMetric: documents, refresh: refreshDocuments },
    { label: "Failed sign-ins (24 hours)", initialMetric: failedSignIns, refresh: refreshFailedSignIns },
  ];
  return (
    <dl className="m-0 mt-2">
      {rows.map(({ label, initialMetric, refresh, format }) => (
        <RefreshableMetric key={label} label={label} initialMetric={initialMetric} refresh={refresh}>
          {(metric, controls, stale) => (
            <MetricRow label={label} metric={metric} format={format} controls={controls} stale={stale} />
          )}
        </RefreshableMetric>
      ))}
      <RefreshableMetric label="Recent admin actions" initialMetric={adminActions} refresh={refreshAdminActions}>
        {(metric, controls, stale) => <RecentAdminActions metric={metric} controls={controls} stale={stale} />}
      </RefreshableMetric>
    </dl>
  );
}
