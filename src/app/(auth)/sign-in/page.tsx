import { SignInForm } from "@/components/arrivo/auth-forms";
import { signInAction } from "../actions";

export default function SignInPage() {
  return (
    <>
      <h1 className="mb-6 text-xl font-semibold" tabIndex={-1}>
        Sign in
      </h1>
      <SignInForm action={signInAction} />
    </>
  );
}
