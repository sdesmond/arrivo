"use client";

import { useRef, useState } from "react";
import { ACTIVITY_RETENTION_DAYS, type ActivityRetentionDays, type ActivityRetentionReadResult } from "@/data/types";
import { saveActivityRetentionPolicy, refreshActivityRetention } from "@/app/(app)/admin/activity/actions";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectGroup } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";

export interface ActivityRetentionSettingsProps {
  initial: ActivityRetentionReadResult;
}

export function ActivityRetentionSettings({ initial }: ActivityRetentionSettingsProps) {
  const [saved, setSaved] = useState<ActivityRetentionDays | null>(initial.status === "ok" ? initial.days : null);
  const [selection, setSelection] = useState<ActivityRetentionDays>(initial.status === "ok" ? initial.days : 90);
  const [inspection, setInspection] = useState<ActivityRetentionReadResult>(initial);
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const cancelRef = useRef<HTMLButtonElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);

  async function refresh() {
    try {
      const result = await refreshActivityRetention();
      setInspection(result);
      if (result.status === "ok") setSaved(result.days);
    } catch {
      setInspection({ status: "unavailable" });
    }
  }

  async function save() {
    setConfirm(false);
    setPending(true);
    setError("");
    setMessage("");
    try {
      const result = await saveActivityRetentionPolicy(selection, saved);
      if (result.status === "ok") {
        setSaved(result.days);
        setMessage(`Retention saved: ${result.days} days`);
        // Inspection is no longer current for this policy; a save never proves deletion finished.
        setInspection({ status: "unavailable" });
      } else {
        setError(
          result.status === "stale"
            ? "Policy changed elsewhere. Review saved retention and confirm again."
            : result.status === "forbidden"
              ? "Admin access is required to save retention."
              : "Could not save retention. Try again."
        );
        await refresh();
      }
    } catch {
      setError("Could not save retention. Try again.");
      await refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      aria-labelledby="activity-retention-heading"
      className="my-4 grid gap-3"
      style={{ fontFamily: "var(--font-body, ui-sans-serif)" }}
    >
      <h3 id="activity-retention-heading" className="font-semibold">
        Activity retention
      </h3>
      <p className="text-sm">
        Choose how long Activity history is kept. Cleanup permanently deletes expired history in background batches.
      </p>
      <p className="text-sm">{saved === null ? "Saved retention unavailable." : `Saved retention: ${saved} days`}</p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <label id="activity-retention-label">Activity retention</label>
          <Select
            value={selection}
            onValueChange={(value) => {
              if (value !== null) setSelection(value);
            }}
            disabled={pending}
          >
            <SelectTrigger aria-labelledby="activity-retention-label" style={{ minHeight: 44, minWidth: 144 }}>
              <SelectValue>{`${selection} days`}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {ACTIVITY_RETENTION_DAYS.map((days) => (
                  <SelectItem key={days} value={days} className="min-h-11 px-2 py-1.5">
                    {days} days
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <Button
          className="h-11"
          ref={saveRef}
          disabled={pending || saved === null}
          onClick={() => {
            setError("");
            if (saved !== null && selection < saved) setConfirm(true);
            else void save();
          }}
        >
          Save retention
        </Button>
      </div>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
      <div className="grid gap-2" aria-live="polite">
        <p className="text-sm">
          {inspection.status !== "ok"
            ? "Cleanup status unavailable."
            : inspection.expired
              ? `Expired activity pending cleanup. Checked at ${inspection.checkedAt}`
              : `No expired activity found at ${inspection.checkedAt}`}
        </p>
        <Button
          variant="outline"
          className="h-11 w-fit"
          disabled={pending}
          onClick={() => {
            setPending(true);
            void refresh().finally(() => setPending(false));
          }}
        >
          Refresh cleanup status
        </Button>
      </div>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent
          initialFocus={cancelRef}
          finalFocus={saveRef}
          className="bottom-0 top-auto translate-y-0 rounded-b-none sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:rounded-b-xl"
        >
          <AlertDialogTitle>Shorten Activity retention?</AlertDialogTitle>
          <AlertDialogDescription>
            Saving {selection} days shortens saved retention of {saved} days. Expired Activity history will be
            permanently deleted by background cleanup. This cannot be undone.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11" ref={cancelRef}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction className="h-11" onClick={() => void save()}>
              Confirm retention change
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
