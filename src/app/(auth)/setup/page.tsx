import { redirect } from "next/navigation";
import { AdminSetupForm } from "@/components/arrivo/auth-forms";
import { isInstanceSetupOpen } from "@/lib/instance-setup";
import { setupAdminAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (!(await isInstanceSetupOpen())) return redirect("/sign-in");
  return (
    <>
      <h1 className="mb-2 text-xl font-semibold" tabIndex={-1}>
        Welcome to Arrivo!
      </h1>
      <p className="mb-6" style={{ color: "var(--fg-2)" }}>
        Let&apos;s get your admin account set up.
      </p>
      <AdminSetupForm action={setupAdminAction} />
    </>
  );
}
