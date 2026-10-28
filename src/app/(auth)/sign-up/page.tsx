import { redirect } from "next/navigation";
import { isInstanceSetupOpen } from "@/lib/instance-setup";

export const dynamic = "force-dynamic";

export default async function SignUpPage() {
  return redirect((await isInstanceSetupOpen()) ? "/setup" : "/sign-in");
}
