const LABEL_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-mono-family, ui-monospace)",
  fontSize: "calc(9px * var(--font-scale))",
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
            fontSize: "calc(9px * var(--font-scale))",
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
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}

export interface FieldProps {
  label: string;
  htmlFor?: string;
  error?: string;
  children: React.ReactNode;
}

export function Field({ label, htmlFor, error, children }: FieldProps) {
  const errorId = htmlFor ? `${htmlFor}-error` : undefined;

  if (process.env.NODE_ENV === "development" && error && !htmlFor) {
    console.warn(
      "Field: error prop provided but htmlFor is absent. Errors are only rendered when htmlFor is specified."
    );
  }

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
      {error && errorId && (
        <p
          id={errorId}
          role="status"
          aria-live="polite"
          style={{ fontSize: "calc(11px * var(--font-scale))", color: "var(--destructive)", marginTop: 4 }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
