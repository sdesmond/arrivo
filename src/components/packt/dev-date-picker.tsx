"use client";

import { useState, useContext } from "react";
import { setMockDate } from "@/lib/mock-date";
import { MockDateContext } from "@/components/providers/mock-date-provider";

export function DevDatePicker() {
  if (process.env.NODE_ENV !== "development") return null;

  return <DevDatePickerInner />;
}

function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function DevDatePickerInner() {
  const mockISO = useContext(MockDateContext);
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(() => (mockISO ? toLocalInputValue(mockISO) : ""));

  function handleApply() {
    if (!inputValue) return;
    const iso = new Date(inputValue).toISOString();
    setMockDate(iso);
  }

  function handleClear() {
    setMockDate(null);
  }

  const isMocked = mockISO !== null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 16,
        right: 16,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 6,
        fontFamily: "var(--font-mono-family, ui-monospace)",
        fontSize: "calc(11px * var(--font-scale))",
      }}
    >
      {open && (
        <div
          style={{
            background: "#1a0a00",
            border: "1.5px solid #ff6a00",
            borderRadius: 10,
            padding: "10px 12px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            minWidth: 220,
          }}
        >
          <div
            style={{
              color: "#ff9a4d",
              fontSize: "calc(10px * var(--font-scale))",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            Mock date / time
          </div>
          <input
            type="datetime-local"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            style={{
              background: "#2a1000",
              border: "1px solid #ff6a00",
              borderRadius: 6,
              color: "#ffcfa0",
              fontFamily: "inherit",
              fontSize: "calc(12px * var(--font-scale))",
              padding: "4px 8px",
              width: "100%",
            }}
          />
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={handleApply}
              style={{
                flex: 1,
                background: "#ff6a00",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                padding: "5px 0",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: "calc(11px * var(--font-scale))",
                fontWeight: 700,
              }}
            >
              Apply
            </button>
            {isMocked && (
              <button
                onClick={handleClear}
                style={{
                  flex: 1,
                  background: "transparent",
                  color: "#ff9a4d",
                  border: "1px solid #ff6a00",
                  borderRadius: 6,
                  padding: "5px 0",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: "calc(11px * var(--font-scale))",
                }}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      <button
        data-testid="dev-date-picker-toggle"
        onClick={() => setOpen((v) => !v)}
        title="Dev date mock"
        style={{
          background: isMocked ? "#ff6a00" : "#1a0a00",
          color: isMocked ? "#fff" : "#ff9a4d",
          border: "1.5px solid #ff6a00",
          borderRadius: 20,
          padding: "4px 10px",
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: "calc(10px * var(--font-scale))",
          fontWeight: 700,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          opacity: open ? 1 : 0.85,
          transition: "opacity 0.15s",
        }}
      >
        {isMocked
          ? `MOCKED · ${new Date(mockISO!).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
          : "LIVE"}
      </button>
    </div>
  );
}
