import { requireAdmin } from "@/lib/auth-helpers";
import { listRecentActivity } from "@/lib/activity-queries";
import { InstanceActivity } from "@/components/arrivo/instance-activity";

export default async function AdminActivityPage() {
  // The layout can be reused by client navigation; guard every page request too.
  const user = await requireAdmin();
  const events = await listRecentActivity(user.id!);
  return (
    <section
      aria-labelledby="admin-activity-heading"
      className="rounded-lg border p-4"
      style={{ borderColor: "var(--line)", background: "var(--surface)" }}
    >
      <h2 id="admin-activity-heading" className="font-semibold text-fg">
        Activity
      </h2>
      <InstanceActivity events={events} />
    </section>
  );
}
