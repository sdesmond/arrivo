"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface RecoveryCodesStepProps {
  codes: string[];
}

const BUTTON_CLASS = "h-11 rounded-lg border px-4 font-medium";
const OUTLINE_STYLE = { borderColor: "var(--line)", background: "var(--surface)" };

// Shown once, right after completion; only hashes are stored. Not a dialog, so Escape has nothing to dismiss,
// and the only way on is the acknowledge button. Revocation already happened and does not wait for it.
export function RecoveryCodesStep({ codes }: RecoveryCodesStepProps) {
  const router = useRouter();
  const heading = useRef<HTMLHeadingElement>(null);
  const text = codes.join("\n");
  useEffect(() => {
    heading.current?.focus();
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Recovery codes copied.");
    } catch {
      toast.error("Couldn't copy. Select the codes and copy them yourself.");
    }
  }

  function handleDownload() {
    const url = URL.createObjectURL(new Blob([`Arrivo recovery codes\n\n${text}\n`], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "arrivo-recovery-codes.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <h1 ref={heading} tabIndex={-1} className="mb-2 text-xl font-semibold outline-none">
        Save your recovery codes
      </h1>
      <p className="mb-4" style={{ color: "var(--fg-2)" }}>
        Your account is recovered. If you lose your phone, each code signs you in once. They won&apos;t be shown again,
        so save them before you continue to sign in.
      </p>
      <ul
        aria-label="Recovery codes"
        className="mb-4 grid grid-cols-2 gap-2"
        style={{ fontFamily: "var(--font-mono-family, ui-monospace)", color: "var(--fg)" }}
      >
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div className="flex flex-col gap-2">
        <button type="button" className={BUTTON_CLASS} style={OUTLINE_STYLE} onClick={handleCopy}>
          Copy codes
        </button>
        <button type="button" className={BUTTON_CLASS} style={OUTLINE_STYLE} onClick={handleDownload}>
          Download .txt
        </button>
        <button
          type="button"
          className="h-11 rounded-lg px-4 font-medium"
          style={{ background: "var(--accent-brand)", color: "var(--fg-on-accent)" }}
          onClick={() => router.push("/sign-in")}
        >
          I saved these
        </button>
      </div>
    </>
  );
}
