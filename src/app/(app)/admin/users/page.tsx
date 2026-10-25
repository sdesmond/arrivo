import { requireAdmin } from "@/lib/auth-helpers";

export default async function AdminUsersPage() {
  // The layout can be reused by client navigation; guard every page request too.
  await requireAdmin();
  return (
    <section
      aria-labelledby="admin-users-heading"
      className="rounded-lg border p-4"
      style={{ borderColor: "var(--line)", background: "var(--surface)" }}
    >
      <h2 id="admin-users-heading" className="font-semibold text-fg">
        Users
      </h2>
    </section>
  );
}
