"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Dialog as BaseUIDialog } from "@base-ui/react/dialog";
import { Dialog, DialogPortal, DialogOverlay, DialogClose } from "@/components/ui/dialog";
import { useIsMobile } from "@/lib/use-is-mobile";
import { X, Share2 } from "lucide-react";
import type { Document } from "@/data/types";
import { shareDoc } from "@/lib/utils";

export interface DocViewerProps {
  doc: Document;
  open: boolean;
  onClose: () => void;
  finalFocusRef?: React.RefObject<HTMLElement | null>;
}

function safeHttpUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("/")) return url;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? url : undefined;
  } catch {
    return undefined;
  }
}

function isCrossOrigin(url: string): boolean {
  if (typeof window === "undefined") return false;
  if (url.startsWith("/")) return false;
  try {
    const parsed = new URL(url);
    return parsed.host !== window.location.host;
  } catch {
    return false;
  }
}

export function DocViewer({ doc, open, onClose, finalFocusRef }: DocViewerProps) {
  const isMobile = useIsMobile();
  const [isMobileSafari, setIsMobileSafari] = useState(false);
  const [sandboxIframe, setSandboxIframe] = useState(false);

  useEffect(() => {
    const userAgent = navigator.userAgent;
    const isIosUa = /iPhone|iPad|iPod/i.test(userAgent);
    const isIpadOsAsMac = /Mac/.test(navigator.platform) && (navigator.maxTouchPoints ?? 0) > 1;
    const isSafariEngine = /Safari/i.test(userAgent) && !/CriOS|FxiOS|OPiOS|mercury/i.test(userAgent);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMobileSafari((isIosUa || isIpadOsAsMac) && isSafariEngine);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSandboxIframe(!!doc.url && isCrossOrigin(doc.url));
  }, [doc.url]);

  useEffect(() => {
    if (!open) return;
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;

    let sentinel: WakeLockSentinel | null = null;
    navigator.wakeLock
      .request("screen")
      .then((lock) => {
        sentinel = lock;
      })
      .catch(() => {});

    return () => {
      sentinel?.release().catch(() => {});
    };
  }, [open]);

  const url = safeHttpUrl(doc.url);

  const popupStyle: React.CSSProperties = isMobile
    ? {
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        background: "var(--bg)",
        zIndex: 50,
        outline: "none",
      }
    : {
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: "min(90vw, 640px)",
        height: "min(90vh, 800px)",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg)",
        borderRadius: "var(--radius-xl)",
        border: "1px solid var(--line)",
        zIndex: 50,
        overflow: "hidden",
        outline: "none",
      };

  const linkStyle: React.CSSProperties = {
    color: "var(--accent-brand)",
    fontFamily: "var(--font-body, ui-sans-serif)",
    padding: "12px 24px",
  };

  const centerStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <DialogPortal>
        <DialogOverlay />
        <BaseUIDialog.Popup style={popupStyle} {...(finalFocusRef ? { finalFocus: finalFocusRef } : {})}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "6px 4px 6px 12px",
              borderBottom: "1px solid var(--line)",
              flexShrink: 0,
            }}
          >
            <DialogClose
              render={
                <button
                  autoFocus
                  title="Close viewer"
                  aria-label="Close viewer"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: 44,
                    minHeight: 44,
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--fg-3)",
                    padding: 0,
                    flexShrink: 0,
                  }}
                />
              }
            >
              <X size={15} strokeWidth={1.5} />
            </DialogClose>
            <span
              style={{
                flex: 1,
                fontFamily: "var(--font-body, ui-sans-serif)",
                fontSize: "calc(14px * var(--font-scale, 1))",
                fontWeight: 500,
                color: "var(--fg)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {doc.name}
            </span>
            <button
              title={`Share ${doc.name}`}
              aria-label={`Share ${doc.name}`}
              onClick={() => {
                void shareDoc(doc);
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 44,
                minHeight: 44,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "var(--fg-3)",
                padding: 0,
                flexShrink: 0,
              }}
            >
              <Share2 size={15} strokeWidth={1.5} />
            </button>
          </div>
          <div style={{ flex: 1, overflow: "auto", position: "relative" }}>
            {!url && (
              <div style={centerStyle}>
                <span
                  style={{
                    color: "var(--fg-3)",
                    fontFamily: "var(--font-body, ui-sans-serif)",
                    padding: "12px 24px",
                  }}
                >
                  Document is not available
                </span>
              </div>
            )}
            {url && doc.kind === "image" && (
              <div style={{ position: "relative", width: "100%", height: "100%" }}>
                <Image src={url} alt={doc.name} fill unoptimized style={{ objectFit: "contain" }} />
              </div>
            )}
            {url && doc.kind === "pdf" && !isMobileSafari && (
              <iframe
                src={url}
                title={doc.name}
                {...(sandboxIframe ? { sandbox: "" } : {})}
                style={{ width: "100%", height: "100%", border: "none", display: "block" }}
              />
            )}
            {url && doc.kind === "pdf" && isMobileSafari && (
              <div style={centerStyle}>
                <a href={url} target="_blank" rel="noopener noreferrer" style={linkStyle}>
                  Open PDF
                </a>
              </div>
            )}
            {url && doc.kind !== "image" && doc.kind !== "pdf" && (
              <div style={centerStyle}>
                <a href={url} download={doc.name} style={linkStyle}>
                  Download
                </a>
              </div>
            )}
          </div>
        </BaseUIDialog.Popup>
      </DialogPortal>
    </Dialog>
  );
}
