"use client";

import { useFormStatus } from "react-dom";

interface AuthSubmitButtonProps {
  label: string;
}

export function AuthSubmitButton({ label }: AuthSubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      aria-busy={pending}
      disabled={pending}
      className="h-11 w-full rounded-lg px-4 font-medium"
      style={{ background: "var(--accent-brand)", color: "var(--fg-on-accent)" }}
    >
      {pending ? "Please wait…" : label}
    </button>
  );
}
