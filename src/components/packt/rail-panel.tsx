"use client";

interface RailPanelProps {
  header: string;
  meta?: string;
  children: React.ReactNode;
}

export function RailPanel({ header, meta, children }: RailPanelProps) {
  return (
    <div
      className="rounded-[10px] overflow-hidden mb-3"
      style={{ border: "1px solid var(--line)", background: "var(--bg)" }}
    >
      <div
        className="flex items-center justify-between px-4 py-2.5"
        style={{ borderBottom: "1px solid var(--line)", background: "var(--surface)" }}
      >
        <span style={{ fontSize: "calc(13px * var(--font-scale))", fontWeight: 600, color: "var(--fg)" }}>
          {header}
        </span>
        {meta && (
          <span
            style={{
              fontFamily: "var(--font-mono-family, ui-monospace)",
              fontSize: "calc(9.5px * var(--font-scale))",
              fontWeight: 500,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--fg-3)",
            }}
          >
            {meta}
          </span>
        )}
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}
