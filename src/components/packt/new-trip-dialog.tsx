"use client";

import { LoaderCircle } from "lucide-react";
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { retrieveLocation, searchLocations } from "@/app/(app)/trips/actions";
import type { LocationSuggestion, RetrievedLocation } from "@/app/(app)/trips/actions";
import { Button } from "@/components/ui/button";
import { Field, Section } from "@/components/packt/form-section";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { NewTripDraft } from "@/data/types";
import { toast } from "sonner";

export interface NewTripDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate?: (draft: NewTripDraft) => void;
  isPending?: boolean;
}

const EMPTY_DRAFT: NewTripDraft = {
  title: "",
  startDate: undefined,
  endDate: undefined,
  budgetAmount: "",
};

function sanitizeBudget(value: string) {
  const numeric = value.replace(/[^\d.]/g, "");
  const [whole, ...decimalParts] = numeric.split(".");
  const decimal = decimalParts.join("");
  return decimalParts.length > 0 ? `${whole}.${decimal.slice(0, 2)}` : whole;
}

export function NewTripDialog({ open, onOpenChange, onCreate, isPending = false }: NewTripDialogProps) {
  const titleRef = useRef<HTMLInputElement>(null);
  const sessionTokenRef = useRef<string>("");

  useEffect(() => {
    if (open && !sessionTokenRef.current) {
      sessionTokenRef.current = crypto.randomUUID();
    }
  }, [open]);
  const cancelRetrieveRef = useRef(false);
  const [draft, setDraft] = useState<NewTripDraft>(EMPTY_DRAFT);
  const [titleError, setTitleError] = useState("");
  const [destinationInput, setDestinationInput] = useState("");
  const [destinationData, setDestinationData] = useState<RetrievedLocation | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [retrieveLoading, setRetrieveLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const timerId = window.setTimeout(() => titleRef.current?.focus(), 0);
    return () => window.clearTimeout(timerId);
  }, [open]);

  useEffect(() => {
    const searchQuery = destinationData?.placeName === destinationInput ? "" : destinationInput.trim();
    if (searchQuery.length < 2) {
      return;
    }

    let active = true;
    const sessionToken = sessionTokenRef.current;

    const timerId = window.setTimeout(async () => {
      try {
        const results = await searchLocations(searchQuery, sessionToken);
        if (!active) return;
        setSuggestions(results.slice(0, 5));
        setHighlightedIndex(-1);
      } catch {
        if (!active) return;
        setSuggestions([]);
        toast.error("Could not search locations");
      } finally {
        if (active) {
          setSuggestionsLoading(false);
        }
      }
    }, 300);

    return () => {
      active = false;
      window.clearTimeout(timerId);
    };
  }, [destinationData, destinationInput]);

  function resetDestinationState() {
    cancelRetrieveRef.current = true;
    setDestinationInput("");
    setDestinationData(null);
    setHighlightedIndex(-1);
    setSuggestions([]);
    setSuggestionsLoading(false);
    setRetrieveLoading(false);
    sessionTokenRef.current = crypto.randomUUID();
  }

  async function handleSuggestionSelect(suggestion: LocationSuggestion) {
    cancelRetrieveRef.current = true; // cancel any pending retrieve first
    setDestinationInput(suggestion.placeName);
    setSuggestions([]);
    setHighlightedIndex(-1);
    setSuggestionsLoading(false);
    setRetrieveLoading(true);
    cancelRetrieveRef.current = false; // now safe to accept the new one
    try {
      const location = await retrieveLocation(suggestion.mapboxId, sessionTokenRef.current);
      if (cancelRetrieveRef.current) {
        sessionTokenRef.current = crypto.randomUUID();
        return; // user typed since — discard stale result
      }
      sessionTokenRef.current = crypto.randomUUID();
      setDestinationData(location);
    } catch (error) {
      if (!cancelRetrieveRef.current) {
        console.error("Location retrieve failed:", error);
        toast.error("Could not load location details");
        setDestinationData(null);
      }
    } finally {
      if (!cancelRetrieveRef.current) {
        setRetrieveLoading(false);
      }
    }
  }

  function handleDestinationKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      setSuggestions([]);
      setHighlightedIndex(-1);
      event.currentTarget.focus();
      return;
    }

    if (suggestions.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((prev) => Math.max(prev - 1, 0));
      return;
    }

    if (event.key === "Enter" && highlightedIndex >= 0) {
      event.preventDefault();
      void handleSuggestionSelect(suggestions[highlightedIndex]);
    }
  }

  function closeDialog() {
    setDraft(EMPTY_DRAFT);
    setTitleError("");
    resetDestinationState();
    onOpenChange(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = draft.title.trim();

    if (!title) {
      setTitleError("Enter a trip title.");
      titleRef.current?.focus();
      return;
    }

    if (onCreate) {
      onCreate({
        title,
        startDate: draft.startDate,
        endDate: draft.endDate,
        budgetAmount: draft.budgetAmount?.replace(/\.$/, "") || undefined,
        destinationName: destinationData?.placeName,
        destinationCountry: destinationData?.country,
        destinationCountryCode: destinationData?.countryCode,
        destinationCenter: destinationData?.center,
      });
      return;
    }

    closeDialog();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) closeDialog();
      }}
    >
      <DialogContent className="gap-0 p-0 sm:max-w-lg" showCloseButton>
        <form onSubmit={handleSubmit}>
          <DialogHeader className="px-5 pt-5 pb-4" style={{ borderBottom: "1px solid var(--line)" }}>
            <DialogTitle>New Trip</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-5 px-5 py-4">
            <Section title="Basics">
              <Field label="Title" htmlFor="new-trip-title" error={titleError}>
                <Input
                  id="new-trip-title"
                  ref={titleRef}
                  value={draft.title}
                  aria-invalid={titleError ? true : undefined}
                  aria-describedby={titleError ? "new-trip-title-error" : undefined}
                  onChange={(event) => {
                    setDraft((prev) => ({ ...prev, title: event.target.value }));
                    if (titleError) setTitleError("");
                  }}
                />
              </Field>

              <Field label="Destination" htmlFor="new-trip-destination">
                <div style={{ position: "relative" }}>
                  <Input
                    id="new-trip-destination"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-busy={suggestionsLoading || retrieveLoading}
                    aria-controls={suggestions.length > 0 ? "new-trip-destination-suggestions" : undefined}
                    aria-expanded={suggestions.length > 0}
                    aria-haspopup="listbox"
                    aria-activedescendant={
                      highlightedIndex >= 0 && suggestions.length > 0
                        ? `new-trip-destination-suggestion-${highlightedIndex}`
                        : undefined
                    }
                    value={destinationInput}
                    placeholder="Optional destination"
                    autoComplete="off"
                    onChange={(event) => {
                      cancelRetrieveRef.current = true;
                      setRetrieveLoading(false);
                      setDestinationInput(event.target.value);
                      setDestinationData(null);
                      setSuggestions([]);
                      setHighlightedIndex(-1);
                      setSuggestionsLoading(event.target.value.trim().length >= 2);
                    }}
                    onKeyDown={handleDestinationKeyDown}
                  />

                  {suggestionsLoading && suggestions.length === 0 && destinationInput.trim().length >= 2 ? (
                    <div
                      style={{
                        position: "absolute",
                        top: "calc(100% + 4px)",
                        right: 0,
                        left: 0,
                        zIndex: 10,
                        padding: "8px 12px",
                        border: "1px solid var(--line)",
                        borderRadius: 8,
                        background: "var(--surface)",
                        color: "var(--fg-muted, var(--fg))",
                        fontSize: "0.875rem",
                        boxShadow: "0 10px 30px color-mix(in srgb, var(--surface-3) 45%, transparent)",
                      }}
                    >
                      Searching…
                    </div>
                  ) : suggestions.length > 0 ? (
                    <ul
                      id="new-trip-destination-suggestions"
                      role="listbox"
                      style={{
                        position: "absolute",
                        top: "calc(100% + 4px)",
                        right: 0,
                        left: 0,
                        zIndex: 10,
                        margin: 0,
                        padding: 4,
                        listStyle: "none",
                        border: "1px solid var(--line)",
                        borderRadius: 8,
                        background: "var(--surface)",
                        boxShadow: "0 10px 30px color-mix(in srgb, var(--surface-3) 45%, transparent)",
                      }}
                    >
                      {suggestions.map((suggestion, index) => (
                        <li
                          key={`${index}-${suggestion.mapboxId ?? suggestion.placeName}`}
                          id={`new-trip-destination-suggestion-${index}`}
                          role="option"
                          aria-selected={highlightedIndex === index}
                          style={{
                            padding: "8px 10px",
                            borderRadius: 6,
                            cursor: retrieveLoading ? "wait" : "pointer",
                            color: "var(--fg)",
                            background: highlightedIndex === index ? "var(--accent-soft)" : "transparent",
                          }}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            void handleSuggestionSelect(suggestion);
                          }}
                        >
                          {suggestion.placeName}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </Field>
            </Section>

            <Section title="Dates">
              <DateRangePicker
                start={draft.startDate}
                end={draft.endDate}
                placeholder="Optional date range"
                onChange={(startDate, endDate) => setDraft((prev) => ({ ...prev, startDate, endDate }))}
              />
            </Section>

            <Section title="Budget">
              <Field label="Budget" htmlFor="new-trip-budget">
                <Input
                  id="new-trip-budget"
                  inputMode="decimal"
                  placeholder="Optional amount"
                  value={draft.budgetAmount ?? ""}
                  onChange={(event) =>
                    setDraft((prev) => ({ ...prev, budgetAmount: sanitizeBudget(event.target.value) }))
                  }
                />
              </Field>
            </Section>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={closeDialog}>
              Cancel
            </Button>
            <Button type="submit" disabled={draft.title.trim().length === 0 || isPending || retrieveLoading}>
              {isPending ? (
                <span className="inline-flex items-center gap-2">
                  <LoaderCircle className="size-4 animate-spin" strokeWidth={1.5} />
                  Creating...
                </span>
              ) : (
                "Create"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
