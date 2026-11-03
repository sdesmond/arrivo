import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth-helpers";
import { db } from "@/db";
import type { PasswordPolicyReadResult } from "@/data/types";
import { PasswordPolicySettings } from "@/components/arrivo/password-policy-settings";
import { readPasswordPolicyForAdmin } from "@/lib/password-policy-store";

export default async function AdminSecurityPage() {
  // The layout can be reused by client navigation; guard every page request too.
  const user = await requireAdmin();
  let policy: PasswordPolicyReadResult;
  try {
    policy = await readPasswordPolicyForAdmin(db, user.id!);
  } catch {
    policy = { status: "unavailable" };
  }
  if (policy.status === "forbidden") notFound();
  return (
    <section
      aria-labelledby="admin-security-heading"
      className="rounded-lg border p-4"
      style={{ borderColor: "var(--line)", background: "var(--surface)" }}
    >
      <h2 id="admin-security-heading" className="font-semibold text-fg">
        Security
      </h2>
      <PasswordPolicySettings initial={policy} />
    </section>
  );
}
