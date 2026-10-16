import { SignUpForm } from "@/components/arrivo/auth-forms";
import { signUpAction } from "../actions";

export default function SignUpPage() {
  return (
    <>
      <h1 className="mb-6 text-xl font-semibold" tabIndex={-1}>
        Create your Arrivo account
      </h1>
      <SignUpForm action={signUpAction} />
    </>
  );
}
