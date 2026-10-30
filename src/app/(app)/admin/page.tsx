import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth-helpers";

export default async function AdminPage() {
  await requireAdmin();
  redirect("/admin/overview");
}
