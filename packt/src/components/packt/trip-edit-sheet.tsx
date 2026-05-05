"use client"

import { useEffect, useState } from "react"
import { Trash2, UserPlus } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
} from "@/components/ui/sheet"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  type Trip,
  type Collaborator,
  type CollaboratorRole,
  type TripStatus,
  type Budget,
} from "@/data/types"

interface TripEditSheetProps {
  trip: Trip | null
  open: boolean
  onClose: () => void
  onSave: (updated: Trip) => void
}

const LABEL_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-mono-family, ui-monospace)",
  fontSize: 9,
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--fg-4)",
  marginBottom: 4,
  display: "block",
}

const SELECT_STYLE: React.CSSProperties = {
  width: "100%",
  padding: "6px 8px",
  fontSize: 13,
  background: "var(--bg)",
  border: "1px solid var(--line-strong)",
  borderRadius: 6,
  color: "var(--fg)",
  outline: "none",
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{
        fontFamily: "var(--font-mono-family, ui-monospace)",
        fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
        textTransform: "uppercase", color: "var(--fg-4)",
        borderBottom: "1px solid var(--line)",
        paddingBottom: 6, marginBottom: 12,
      }}>
        {title}
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span style={LABEL_STYLE}>{label}</span>
      {children}
    </div>
  )
}

export function TripEditSheet({ trip, open, onClose, onSave }: TripEditSheetProps) {
  const [draft, setDraft] = useState<Trip | null>(trip)
  const [newName, setNewName] = useState("")
  const [newEmail, setNewEmail] = useState("")
  const [newRole, setNewRole] = useState<CollaboratorRole>("editor")

  useEffect(() => {
    if (trip) setDraft(trip)
  }, [trip])

  if (!draft) return null

  function set<K extends keyof Trip>(key: K, value: Trip[K]) {
    setDraft(prev => prev ? { ...prev, [key]: value } : prev)
  }

  function setBudget(key: keyof Budget, value: string | number | undefined) {
    setDraft(prev => {
      if (!prev) return prev
      const budget = { currency: "USD", ...prev.budget, [key]: value || undefined }
      return { ...prev, budget }
    })
  }

  function removeCollaborator(index: number) {
    setDraft(prev => prev ? {
      ...prev,
      collaborators: prev.collaborators?.filter((_, i) => i !== index),
    } : prev)
  }

  function updateCollaboratorRole(index: number, role: CollaboratorRole) {
    setDraft(prev => {
      if (!prev?.collaborators) return prev
      const updated = [...prev.collaborators]
      updated[index] = { ...updated[index], role }
      return { ...prev, collaborators: updated }
    })
  }

  function handleAddCollaborator() {
    const name = newName.trim()
    const email = newEmail.trim()
    if (!name || !email) return
    const parts = name.split(" ")
    const initials = ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase()
    const collab: Collaborator = { name, email, initials, role: newRole }
    setDraft(prev => prev ? {
      ...prev,
      collaborators: [...(prev.collaborators ?? []), collab],
    } : prev)
    setNewName("")
    setNewEmail("")
    setNewRole("editor")
  }

  return (
    <Sheet open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <SheetContent side="right" showCloseButton={false} className="flex flex-col p-0">
        <SheetHeader className="px-5 pt-5 pb-4 shrink-0" style={{ borderBottom: "1px solid var(--line)" }}>
          <SheetTitle>Edit Trip</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-6">
          {/* Basic */}
          <Section title="Basic">
            <Field label="Trip name">
              <Input value={draft.name} onChange={e => set("name", e.target.value)} />
            </Field>
            <Field label="Status">
              <select
                style={SELECT_STYLE}
                value={draft.status}
                onChange={e => set("status", e.target.value as TripStatus)}
              >
                <option value="draft">Draft</option>
                <option value="upcoming">Upcoming</option>
                <option value="active">Active</option>
                <option value="past">Past</option>
              </select>
            </Field>
          </Section>

          {/* Dates */}
          <Section title="Dates">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start date">
                <Input
                  type="date"
                  value={draft.startDate ?? ""}
                  onChange={e => set("startDate", e.target.value)}
                />
              </Field>
              <Field label="End date">
                <Input
                  type="date"
                  value={draft.endDate ?? ""}
                  onChange={e => set("endDate", e.target.value)}
                />
              </Field>
            </div>
          </Section>

          {/* Cover Image */}
          <Section title="Cover image">
            <Field label="Image URL">
              <Input
                value={draft.coverImageUrl ?? ""}
                placeholder="https://…"
                onChange={e => set("coverImageUrl", e.target.value || undefined)}
              />
            </Field>
            {draft.coverImageUrl && (
              <img
                src={draft.coverImageUrl}
                alt={draft.name}
                style={{
                  width: "100%", maxHeight: 120, objectFit: "cover",
                  borderRadius: 6, border: "1px solid var(--line)",
                }}
              />
            )}
          </Section>

          {/* Notes */}
          <Section title="Notes">
            <textarea
              value={draft.notes ?? ""}
              onChange={e => set("notes", e.target.value || undefined)}
              rows={4}
              style={{ ...SELECT_STYLE, resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }}
            />
          </Section>

          {/* Budget */}
          <Section title="Budget">
            <Field label="Currency">
              <Input
                value={draft.budget?.currency ?? ""}
                placeholder="USD"
                onChange={e => setBudget("currency", e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Total">
                <Input
                  type="number"
                  min={0}
                  value={draft.budget?.total ?? ""}
                  onChange={e => setBudget("total", e.target.value ? Number(e.target.value) : undefined)}
                />
              </Field>
              <Field label="Per person">
                <Input
                  type="number"
                  min={0}
                  value={draft.budget?.perPerson ?? ""}
                  onChange={e => setBudget("perPerson", e.target.value ? Number(e.target.value) : undefined)}
                />
              </Field>
            </div>
          </Section>

          {/* People */}
          <Section title="People">
            {(draft.collaborators ?? []).length > 0 ? (
              <div className="flex flex-col gap-2">
                {draft.collaborators!.map((c, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2"
                    style={{ padding: "6px 8px", borderRadius: 8, background: "var(--surface-2)" }}
                  >
                    {/* Avatar */}
                    <span
                      className="rounded-full flex items-center justify-center shrink-0"
                      style={{
                        width: 28, height: 28, fontSize: 10, fontWeight: 700,
                        letterSpacing: "0.04em",
                        background: c.tint?.bg ?? "var(--surface-3)",
                        color: c.tint?.fg ?? "var(--fg-2)",
                      }}
                    >
                      {c.initials}
                    </span>
                    {/* Name + email */}
                    <div className="flex-1 min-w-0">
                      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--fg)" }}>{c.name}</div>
                      <div style={{ fontSize: 11.5, color: "var(--fg-3)" }}>{c.email}</div>
                    </div>
                    {/* Role select */}
                    <select
                      style={{ ...SELECT_STYLE, width: "auto", fontSize: 11.5, padding: "3px 6px" }}
                      value={c.role}
                      disabled={c.role === "owner"}
                      onChange={e => updateCollaboratorRole(i, e.target.value as CollaboratorRole)}
                    >
                      <option value="owner">Owner</option>
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </select>
                    {/* Remove */}
                    <button
                      disabled={c.role === "owner"}
                      onClick={() => removeCollaborator(i)}
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
              <div style={{ fontSize: 13, color: "var(--fg-4)" }}>No collaborators yet.</div>
            )}

            {/* Add person */}
            <div
              className="flex flex-col gap-2"
              style={{ padding: "10px 10px 8px", borderRadius: 8, border: "1px dashed var(--line-strong)" }}
            >
              <span style={{ ...LABEL_STYLE, marginBottom: 2 }}>Add person</span>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Name"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                />
                <Input
                  placeholder="Email"
                  type="email"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <select
                  style={{ ...SELECT_STYLE, flex: 1 }}
                  value={newRole}
                  onChange={e => setNewRole(e.target.value as CollaboratorRole)}
                >
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAddCollaborator}
                  disabled={!newName.trim() || !newEmail.trim()}
                >
                  <UserPlus size={13} strokeWidth={1.5} />
                  Add
                </Button>
              </div>
            </div>
          </Section>
        </div>

        <SheetFooter className="shrink-0" style={{ borderTop: "1px solid var(--line)" }}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(draft)}>Save changes</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
