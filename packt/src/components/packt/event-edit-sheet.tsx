"use client"

import { useEffect, useState } from "react"
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
  type TripEvent,
  type EventLocation,
  type TransportDetail,
  type EventCategory,
  type EventStatus,
  type EventPriority,
  type TimeBucket,
  TRANSPORT_CATEGORIES,
} from "@/data/types"

interface EventEditSheetProps {
  event: TripEvent | null
  open: boolean
  onClose: () => void
  onSave: (updated: TripEvent) => void
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

export function EventEditSheet({ event, open, onClose, onSave }: EventEditSheetProps) {
  const [draft, setDraft] = useState<TripEvent | null>(event)

  useEffect(() => {
    if (event) setDraft(event)
  }, [event])

  if (!draft) return null

  const isTransport = TRANSPORT_CATEGORIES.includes(draft.category)

  function set<K extends keyof TripEvent>(key: K, value: TripEvent[K]) {
    setDraft(prev => prev ? { ...prev, [key]: value } : prev)
  }

  function setLocation(key: keyof EventLocation, value: string) {
    setDraft(prev => prev ? { ...prev, location: { ...prev.location, [key]: value || undefined } } : prev)
  }

  function setTransport(key: keyof TransportDetail, value: string) {
    setDraft(prev => {
      if (!prev) return prev
      const t = prev.transport ?? { origin: "", destination: "" }
      return { ...prev, transport: { ...t, [key]: value || undefined } }
    })
  }

  return (
    <Sheet open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <SheetContent side="right" showCloseButton={false} className="flex flex-col p-0">
        <SheetHeader className="px-5 pt-5 pb-4 shrink-0" style={{ borderBottom: "1px solid var(--line)" }}>
          <SheetTitle>Edit Event</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-6">
          <Section title="Basic">
            <Field label="Name">
              <Input value={draft.name} onChange={e => set("name", e.target.value)} />
            </Field>
            <Field label="Subtitle">
              <Input value={draft.subtitle ?? ""} onChange={e => set("subtitle", e.target.value || undefined)} />
            </Field>
            <Field label="Category">
              <select
                style={SELECT_STYLE}
                value={draft.category}
                onChange={e => set("category", e.target.value as EventCategory)}
              >
                <optgroup label="Transport">
                  <option value="Flight">Flight</option>
                  <option value="Train">Train</option>
                  <option value="Bus">Bus</option>
                  <option value="Ferry">Ferry</option>
                  <option value="Taxi">Taxi</option>
                  <option value="RentalCar">Rental Car</option>
                  <option value="Transfer">Transfer</option>
                  <option value="RideShare">Rideshare</option>
                </optgroup>
                <optgroup label="Accommodation">
                  <option value="Hotel">Hotel</option>
                  <option value="Hostel">Hostel</option>
                  <option value="Airbnb">Airbnb</option>
                  <option value="Resort">Resort</option>
                  <option value="Camping">Camping</option>
                </optgroup>
                <optgroup label="Food & Drink">
                  <option value="Restaurant">Restaurant</option>
                  <option value="Cafe">Cafe</option>
                  <option value="Bar">Bar</option>
                  <option value="Drinks">Drinks</option>
                  <option value="StreetFood">Street Food</option>
                  <option value="Market">Market</option>
                </optgroup>
                <optgroup label="Culture">
                  <option value="Museum">Museum</option>
                  <option value="Gallery">Gallery</option>
                  <option value="Monument">Monument</option>
                  <option value="HistoricSite">Historic Site</option>
                  <option value="Show">Show</option>
                  <option value="Concert">Concert</option>
                </optgroup>
                <optgroup label="Nature & Outdoor">
                  <option value="Park">Park</option>
                  <option value="Hike">Hike</option>
                  <option value="Beach">Beach</option>
                  <option value="Viewpoint">Viewpoint</option>
                  <option value="Garden">Garden</option>
                </optgroup>
                <optgroup label="Activity">
                  <option value="Tour">Tour</option>
                  <option value="Cruise">Cruise</option>
                  <option value="Sport">Sport</option>
                  <option value="Shopping">Shopping</option>
                  <option value="Spa">Spa</option>
                </optgroup>
                <optgroup label="Logistics">
                  <option value="Visa">Visa</option>
                  <option value="Insurance">Insurance</option>
                  <option value="Currency">Currency</option>
                  <option value="Packing">Packing</option>
                </optgroup>
                <option value="Other">Other</option>
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Status">
                <select
                  style={SELECT_STYLE}
                  value={draft.status}
                  onChange={e => set("status", e.target.value as EventStatus)}
                >
                  <option value="scheduled">Scheduled</option>
                  <option value="done">Done</option>
                  <option value="skipped">Skipped</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </Field>
              <Field label="Priority">
                <select
                  style={SELECT_STYLE}
                  value={draft.priority ?? ""}
                  onChange={e => set("priority", (e.target.value as EventPriority) || undefined)}
                >
                  <option value="">—</option>
                  <option value="must-do">Must do</option>
                  <option value="want-to">Want to</option>
                  <option value="flexible">Flexible</option>
                </select>
              </Field>
            </div>
          </Section>

          <Section title="Schedule">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date">
                <Input
                  type="date"
                  value={draft.date ?? ""}
                  onChange={e => set("date", e.target.value || undefined)}
                />
              </Field>
              <Field label="Time">
                <Input
                  type="time"
                  value={draft.time ?? ""}
                  onChange={e => set("time", e.target.value || undefined)}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Duration (min)">
                <Input
                  type="number"
                  min={0}
                  value={draft.durationMinutes ?? ""}
                  onChange={e => set("durationMinutes", e.target.value ? Number(e.target.value) : undefined)}
                />
              </Field>
              <Field label="Time bucket">
                <select
                  style={SELECT_STYLE}
                  value={draft.bucket ?? ""}
                  onChange={e => set("bucket", (e.target.value as TimeBucket) || undefined)}
                >
                  <option value="">None</option>
                  <option value="morning">Morning</option>
                  <option value="afternoon">Afternoon</option>
                  <option value="evening">Evening</option>
                  <option value="anytime">Anytime</option>
                </select>
              </Field>
            </div>
          </Section>

          <Section title="Location">
            <Field label="Address">
              <Input
                value={draft.location?.address ?? ""}
                onChange={e => setLocation("address", e.target.value)}
              />
            </Field>
          </Section>

          {isTransport && (
            <Section title="Transport">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Origin">
                  <Input
                    value={draft.transport?.origin ?? ""}
                    onChange={e => setTransport("origin", e.target.value)}
                  />
                </Field>
                <Field label="Destination">
                  <Input
                    value={draft.transport?.destination ?? ""}
                    onChange={e => setTransport("destination", e.target.value)}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Operator">
                  <Input
                    value={draft.transport?.operator ?? ""}
                    onChange={e => setTransport("operator", e.target.value)}
                  />
                </Field>
                <Field label="Service no.">
                  <Input
                    value={draft.transport?.serviceNumber ?? ""}
                    onChange={e => setTransport("serviceNumber", e.target.value)}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Terminal">
                  <Input
                    value={draft.transport?.terminal ?? ""}
                    onChange={e => setTransport("terminal", e.target.value)}
                  />
                </Field>
                <Field label="Gate">
                  <Input
                    value={draft.transport?.gate ?? ""}
                    onChange={e => setTransport("gate", e.target.value)}
                  />
                </Field>
                <Field label="Seat">
                  <Input
                    value={draft.transport?.seat ?? ""}
                    onChange={e => setTransport("seat", e.target.value)}
                  />
                </Field>
              </div>
              <Field label="Class">
                <Input
                  value={draft.transport?.class ?? ""}
                  onChange={e => setTransport("class", e.target.value)}
                />
              </Field>
            </Section>
          )}

          <Section title="Details">
            <Field label="Note">
              <textarea
                value={draft.note ?? ""}
                onChange={e => set("note", e.target.value || undefined)}
                rows={3}
                style={{
                  ...SELECT_STYLE,
                  resize: "vertical",
                  fontFamily: "inherit",
                  lineHeight: 1.5,
                }}
              />
            </Field>
            <Field label="Confirmation number">
              <Input
                value={draft.confirmationNumber ?? ""}
                onChange={e => set("confirmationNumber", e.target.value || undefined)}
              />
            </Field>
          </Section>
        </div>

        <SheetFooter className="shrink-0" style={{ borderTop: "1px solid var(--line)" }}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(draft)}>Save</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
