"use client";

import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { copyToClipboard } from "@/lib/clipboard";

interface SetupLinkResultProps {
  username: string;
  expiresAt: string;
  setupUrl: string;
}

export function SetupLinkResult({ username, expiresAt, setupUrl }: SetupLinkResultProps) {
  function copyLink() {
    void copyToClipboard(setupUrl, "Couldn't copy. Select the link and copy it manually.");
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p>
        Username: <strong>{username}</strong>
      </p>
      <p>
        Expires: <time dateTime={expiresAt}>{new Date(expiresAt).toLocaleString()}</time>
      </p>
      <p className="select-text" style={{ overflowWrap: "anywhere" }}>
        {setupUrl}
      </p>
      <Button
        variant="outline"
        size="icon"
        className="size-11"
        title="Copy link"
        aria-label="Copy link"
        onClick={copyLink}
      >
        <Copy strokeWidth={1.5} />
      </Button>
    </div>
  );
}
