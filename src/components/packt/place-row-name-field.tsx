"use client";

export interface PlaceRowNameFieldProps {
  isEditingName: boolean;
  draftName: string;
  onDraftChange: (v: string) => void;
  onBlur: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  displayName: string;
  isHovered?: boolean;
  isDraft?: boolean;
  onStartEdit: () => void;
}

export function PlaceRowNameField({
  isEditingName,
  draftName,
  onDraftChange,
  onBlur,
  onKeyDown,
  displayName,
  isDraft,
  onStartEdit,
}: PlaceRowNameFieldProps) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      {isEditingName ? (
        <input
          autoFocus
          placeholder={isDraft ? "Event name" : undefined}
          value={draftName}
          onChange={(event) => onDraftChange(event.target.value)}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          style={{
            fontSize: "calc(14px * var(--font-scale))",
            fontWeight: 600,
            color: "var(--fg)",
            background: "var(--surface-2)",
            border: "1px solid var(--accent-brand)",
            borderRadius: 4,
            padding: "1px 6px",
            outline: "none",
            width: "100%",
            fontFamily: "inherit",
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => onStartEdit()}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") onStartEdit();
          }}
          style={{
            fontSize: "calc(14px * var(--font-scale))",
            fontWeight: 600,
            color: "var(--fg)",
            lineHeight: 1.2,
            cursor: "text",
            background: "none",
            border: "none",
            padding: 0,
            fontFamily: "inherit",
            textAlign: "left",
          }}
        >
          {displayName}
        </button>
      )}
    </div>
  );
}
