import { SignInForm } from "@/components/arrivo/auth-forms";
import { signInAction, verifyMfaAction } from "../actions";

interface SignInPageProps {
  searchParams: Promise<{ notice?: string | string[] }>;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const { notice } = await searchParams;
  return (
    <>
      <h1 className="mb-6 text-xl font-semibold" tabIndex={-1}>
        Sign in
      </h1>
      <SignInForm
        action={signInAction}
        mfaAction={verifyMfaAction}
        notice={typeof notice === "string" ? notice : undefined}
      />
    </>
  );
}
