import { connection } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import {
  readDatabaseHealth,
  readUserCounts,
  readVersion,
  readStorageHealth,
  readUploadStorageBytes,
} from "@/lib/overview-readers";
import { MetricRow } from "@/components/arrivo/metric-row";

export default async function AdminOverviewPage() {
  // The layout can be reused by client navigation; guard every page request too.
  await requireAdmin();
  // Live measurements: never prerender.
  await connection();
  const [version, database, counts, storage, uploadBytes] = await Promise.all([
    readVersion(),
    readDatabaseHealth(),
    readUserCounts(),
    readStorageHealth(),
    readUploadStorageBytes(),
  ]);
  const uploadStorage =
    uploadBytes.status === "ok" ? { ...uploadBytes, value: `${uploadBytes.value} bytes` } : uploadBytes;
  return (
    <section
      aria-labelledby="admin-overview-heading"
      className="max-w-3xl rounded-lg border p-4"
      style={{ borderColor: "var(--line)", background: "var(--surface)" }}
    >
      <h2 id="admin-overview-heading" className="font-semibold text-fg">
        Overview
      </h2>
      <dl className="m-0 mt-2">
        <MetricRow label="Version" metric={version} />
        <MetricRow label="Database" metric={database} />
        <MetricRow label="Document storage" metric={storage} />
        <MetricRow label="Upload storage" metric={uploadStorage} />
        <MetricRow label="Users" metric={counts.users} />
        <MetricRow label="Admins" metric={counts.admins} />
        <MetricRow label="Pending setup" metric={counts.pending} />
      </dl>
    </section>
  );
}
