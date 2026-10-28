import { requireAdmin } from "@/lib/auth-helpers";
import { listInstanceUsers } from "@/lib/instance-users";
import { InstanceUsersList } from "@/components/arrivo/instance-users-list";
import { AddUserDialog } from "@/components/arrivo/add-user-dialog";

export default async function AdminUsersPage() {
  // The layout can be reused by client navigation; guard every page request too.
  const user = await requireAdmin();
  const users = await listInstanceUsers();
  return (
    <section
      aria-labelledby="admin-users-heading"
      className="rounded-lg border p-4"
      style={{ borderColor: "var(--line)", background: "var(--surface)" }}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="admin-users-heading" className="font-semibold text-fg">
          Users
        </h2>
        <AddUserDialog />
      </div>
      <InstanceUsersList users={users} currentUserId={user.id!} />
    </section>
  );
}
