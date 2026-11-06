"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

interface AuthSubmitButtonProps {
  label: string;
}

export function AuthSubmitButton({ label }: AuthSubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      loading={pending}
      className="h-11 w-full rounded-lg px-4 font-medium"
      style={{ background: "var(--accent-brand)", color: "var(--fg-on-accent)" }}
    >
      {label}
    </Button>
  );
}
