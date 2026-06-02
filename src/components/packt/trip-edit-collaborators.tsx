"use client";

import { useState } from "react";
import { Trash2, UserPlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type Collaborator, type CollaboratorRole } from "@/data/types";

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
          {collaborators.map((collaborator, i) => (
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
                  background: collaborator.tint?.bg ?? "var(--surface-3)",
                  color: collaborator.tint?.fg ?? "var(--fg-2)",
                }}
              >
                {collaborator.initials}
              </span>
              <div className="flex-1 min-w-0">
                <div style={{ fontSize: "calc(13px * var(--font-scale))", fontWeight: 500, color: "var(--fg)" }}>
                  {collaborator.name}
                </div>
                <div style={{ fontSize: "calc(11.5px * var(--font-scale))", color: "var(--fg-3)" }}>
                  {collaborator.email}
                </div>
              </div>
              <Select
                value={collaborator.role}
                onValueChange={(selectedValue) => onUpdateRole(i, selectedValue as CollaboratorRole)}
              >
                <SelectTrigger disabled={collaborator.role === "owner"} aria-label={`Role for ${collaborator.name}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">Owner</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
              <button
                disabled={collaborator.role === "owner"}
                onClick={() => onRemove(i)}
                className="p-1 rounded-[5px] transition-colors"
                style={{
                  color: collaborator.role === "owner" ? "var(--fg-5)" : "var(--fg-3)",
                  cursor: collaborator.role === "owner" ? "not-allowed" : "pointer",
                }}
                title={collaborator.role === "owner" ? "Owner cannot be removed" : "Remove"}
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
        <span>Add person</span>
        <div className="grid grid-cols-2 gap-2">
          <Input placeholder="Name" value={newName} onChange={(event) => setNewName(event.target.value)} />
          <Input
            placeholder="Email"
            type="email"
            value={newEmail}
            onChange={(event) => setNewEmail(event.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Select value={newRole} onValueChange={(selectedValue) => setNewRole(selectedValue as CollaboratorRole)}>
            <SelectTrigger aria-label="New person role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="editor">Editor</SelectItem>
              <SelectItem value="viewer">Viewer</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleAdd} disabled={!newName.trim() || !newEmail.trim()}>
            <UserPlus size={13} strokeWidth={1.5} />
            Add
          </Button>
        </div>
      </div>
    </div>
  );
}
