"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { copyText } from "@/lib/clipboard";

interface SetupLinkResultProps {
  username: string;
  expiresAt: string;
  setupUrl: string;
}

export function SetupLinkResult({ username, expiresAt, setupUrl }: SetupLinkResultProps) {
  const [copyMessage, setCopyMessage] = useState("");

  async function copyLink() {
    setCopyMessage(
      (await copyText(setupUrl)) ? "Link copied." : "Couldn't copy. Select the link and copy it manually."
    );
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
      {copyMessage && <p role="status">{copyMessage}</p>}
    </div>
  );
}
