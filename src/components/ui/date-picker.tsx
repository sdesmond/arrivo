"use client";

import * as React from "react";
import { format, parseISO } from "date-fns";
import { CalendarIcon, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface DatePickerProps {
  value?: string;
  onChange: (value: string | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
  onOpenChange?: (open: boolean) => void;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  disabled,
  clearable = true,
  onOpenChange,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const selected = value ? parseISO(value) : undefined;

  function handleOpenChange(isOpen: boolean) {
    setOpen(isOpen);
    onOpenChange?.(isOpen);
  }

  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger
          disabled={disabled}
          aria-label={ariaLabel}
          aria-invalid={ariaInvalid}
          className={cn(buttonVariants({ variant: "outline" }), "flex-1 justify-start font-normal")}
          style={{ color: value ? "var(--fg)" : "var(--fg-3)" }}
        >
          <CalendarIcon size={16} strokeWidth={1.5} className="mr-2 shrink-0" />
          {value ? format(selected!, "MMMM d, yyyy") : placeholder}
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(date) => {
              onChange(date ? format(date, "yyyy-MM-dd") : undefined);
              handleOpenChange(false);
            }}
          />
        </PopoverContent>
      </Popover>
      {clearable && value && (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Clear date"
          disabled={disabled}
          onClick={() => onChange(undefined)}
          style={{ color: "var(--fg-3)" }}
        >
          <X size={14} strokeWidth={1.5} />
        </Button>
      )}
    </div>
  );
}
