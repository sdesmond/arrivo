const LABEL_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-mono-family, ui-monospace)",
  fontSize: 9,
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--fg-4)",
  marginBottom: 4,
  display: "block",
};

export interface SectionProps {
  title?: string;
  children: React.ReactNode;
}

export function Section({ title, children }: SectionProps) {
  return (
    <div>
      {title && (
        <div
          style={{
            fontFamily: "var(--font-mono-family, ui-monospace)",
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--fg-4)",
            borderBottom: "1px solid var(--line)",
            paddingBottom: 6,
            marginBottom: 12,
          }}
        >
          {title}
        </div>
      )}
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

export interface FieldProps {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}

export function Field({ label, htmlFor, children }: FieldProps) {
  return (
    <div>
      {htmlFor ? (
        <label htmlFor={htmlFor} style={LABEL_STYLE}>
          {label}
        </label>
      ) : (
        <span style={LABEL_STYLE}>{label}</span>
      )}
      {children}
    </div>
  );
}
