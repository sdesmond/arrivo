import { redirect } from "next/navigation";
import { isAppSetupOpen } from "@/lib/app-setup";

export const dynamic = "force-dynamic";

export default async function SignUpPage() {
  return redirect((await isAppSetupOpen()) ? "/setup" : "/sign-in");
}
