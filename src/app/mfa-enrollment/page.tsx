import { redirect } from "next/navigation";
import { requireEnrollmentUser } from "@/lib/auth-helpers";
import { MfaEnrollmentForm } from "./form";

export default async function MfaEnrollmentPage() {
  const user = await requireEnrollmentUser();
  if (!user.mfaEnrollmentRequired) redirect("/trips");
  return <MfaEnrollmentForm />;
}
