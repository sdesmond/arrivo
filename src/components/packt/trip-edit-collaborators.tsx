"use client";

import { useState } from "react";
import { Trash2, UserPlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { type Collaborator, type CollaboratorRole } from "@/data/types";

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

const SELECT_STYLE: React.CSSProperties = {
  width: "100%",
  padding: "6px 8px",
  fontSize: "calc(13px * var(--font-scale))",
  background: "var(--bg)",
  border: "1px solid var(--line-strong)",
  borderRadius: 6,
  color: "var(--fg)",
  outline: "none",
};

interface TripEditCollaboratorsProps {
  collaborators: Collaborator[];
  onRemove: (index: number) => void;
  onUpdateRole: (index: number, role: CollaboratorRole) => void;
  onAdd: (name: string, email: string, role: CollaboratorRole) => void;
}

export function TripEditCollaborators({ collaborators, onRemove, onUpdateRole, onAdd }: TripEditCollaboratorsProps) {
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<CollaboratorRole>("editor");

  function handleAdd() {
    const name = newName.trim();
    const email = newEmail.trim();
    if (!name || !email) return;
    onAdd(name, email, newRole);
    setNewName("");
    setNewEmail("");
    setNewRole("editor");
  }

  return (
    <div className="flex flex-col gap-2">
      {collaborators.length > 0 ? (
        <div className="flex flex-col gap-2">
          {collaborators.map((c, i) => (
            <div
              key={i}
              className="flex items-center gap-2"
              style={{ padding: "6px 8px", borderRadius: 8, background: "var(--surface-2)" }}
            >
              <span
                className="rounded-full flex items-center justify-center shrink-0"
                style={{
                  width: 28,
                  height: 28,
                  fontSize: "calc(10px * var(--font-scale))",
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  background: c.tint?.bg ?? "var(--surface-3)",
                  color: c.tint?.fg ?? "var(--fg-2)",
                }}
              >
                {c.initials}
              </span>
              <div className="flex-1 min-w-0">
                <div style={{ fontSize: "calc(13px * var(--font-scale))", fontWeight: 500, color: "var(--fg)" }}>
                  {c.name}
                </div>
                <div style={{ fontSize: "calc(11.5px * var(--font-scale))", color: "var(--fg-3)" }}>{c.email}</div>
              </div>
              <select
                style={{
                  ...SELECT_STYLE,
                  width: "auto",
                  fontSize: "calc(11.5px * var(--font-scale))",
                  padding: "3px 6px",
                }}
                value={c.role}
                disabled={c.role === "owner"}
                onChange={(e) => onUpdateRole(i, e.target.value as CollaboratorRole)}
              >
                <option value="owner">Owner</option>
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
              <button
                disabled={c.role === "owner"}
                onClick={() => onRemove(i)}
                className="p-1 rounded-[5px] transition-colors"
                style={{
                  color: c.role === "owner" ? "var(--fg-5)" : "var(--fg-3)",
                  cursor: c.role === "owner" ? "not-allowed" : "pointer",
                }}
                title={c.role === "owner" ? "Owner cannot be removed" : "Remove"}
              >
                <Trash2 size={13} strokeWidth={1.5} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--fg-4)" }}>No collaborators yet.</div>
      )}

      <div
        className="flex flex-col gap-2"
        style={{
          padding: "10px 10px 8px",
          borderRadius: 8,
          border: "1px dashed var(--line-strong)",
        }}
      >
        <span style={{ ...LABEL_STYLE, marginBottom: 2 }}>Add person</span>
        <div className="grid grid-cols-2 gap-2">
          <Input placeholder="Name" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <Input placeholder="Email" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <select
            style={{ ...SELECT_STYLE, flex: 1 }}
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as CollaboratorRole)}
          >
            <option value="editor">Editor</option>
            <option value="viewer">Viewer</option>
          </select>
          <Button variant="outline" size="sm" onClick={handleAdd} disabled={!newName.trim() || !newEmail.trim()}>
            <UserPlus size={13} strokeWidth={1.5} />
            Add
          </Button>
        </div>
      </div>
    </div>
  );
}
