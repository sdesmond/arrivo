import { requireAdmin } from "@/lib/auth-helpers";
import { AdminSectionNav } from "@/components/arrivo/admin-section-nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="px-4 py-6 sm:px-6 sm:py-8">
      <h1
        className="mb-6 text-2xl font-bold text-fg"
        style={{ fontFamily: "var(--font-heading-family, ui-sans-serif)" }}
      >
        Manage app
      </h1>
      <AdminSectionNav>{children}</AdminSectionNav>
    </div>
  );
}
