import { connection } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import {
  readDatabaseHealth,
  readUserCounts,
  readVersion,
  readStorageHealth,
  readUploadStorageBytes,
  readTripCount,
  readDocumentCount,
  readFailedSignIns,
  readRecentAdminActions,
} from "@/lib/overview-readers";
import { OverviewMetrics } from "@/components/arrivo/overview-metrics";

export default async function AdminOverviewPage() {
  // The layout can be reused by client navigation; guard every page request too.
  await requireAdmin();
  // Live measurements: never prerender.
  await connection();
  const [version, database, counts, storage, uploadBytes, tripCount, documentCount, failedSignIns, adminActions] =
    await Promise.all([
      readVersion(),
      readDatabaseHealth(),
      readUserCounts(),
      readStorageHealth(),
      readUploadStorageBytes(),
      readTripCount(),
      readDocumentCount(),
      readFailedSignIns(),
      readRecentAdminActions(),
    ]);
  return (
    <section
      aria-labelledby="admin-overview-heading"
      className="max-w-3xl rounded-lg border p-4"
      style={{ borderColor: "var(--line)", background: "var(--surface)" }}
    >
      <h2 id="admin-overview-heading" className="font-semibold text-fg">
        Overview
      </h2>
      <OverviewMetrics
        version={version}
        database={database}
        storage={storage}
        uploadBytes={uploadBytes}
        users={counts.users}
        admins={counts.admins}
        pending={counts.pending}
        trips={tripCount}
        documents={documentCount}
        failedSignIns={failedSignIns}
        adminActions={adminActions}
      />
    </section>
  );
}
