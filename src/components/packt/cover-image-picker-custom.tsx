"use client";

import { useState } from "react";
import * as LucideIcons from "lucide-react";
import { Button } from "@/components/ui/button";
import { GRAPHIC_COVER_COLORS, GRAPHIC_COVER_ICONS } from "@/lib/utils";

const graphicIconLookup = LucideIcons as unknown as Record<
  string,
  React.ComponentType<{ size?: number; strokeWidth?: number; style?: React.CSSProperties }>
>;

const COLOR_LABELS: Record<(typeof GRAPHIC_COVER_COLORS)[number], string> = {
  "var(--accent-brand)": "Brand",
  "var(--color-indigo-500)": "Indigo",
  "var(--color-pink-500)": "Pink",
  "var(--color-teal-500)": "Teal",
  "var(--color-amber-500)": "Amber",
  "var(--color-red-500)": "Red",
  "var(--color-emerald-500)": "Emerald",
  "var(--color-slate-500)": "Slate",
  "var(--color-violet-500)": "Violet",
  "var(--color-orange-500)": "Orange",
};

const selectStyles = {
  border: "1px solid var(--line)",
  borderRadius: 6,
  padding: "8px 12px",
  width: "100%",
  fontSize: 14,
  background: "var(--surface)",
  color: "var(--fg)",
} satisfies React.CSSProperties;

export interface CoverImagePickerCustomProps {
  onImageSelected: (url: string) => void;
  onClose: () => void;
}

function toGraphicIconKey(iconName: string): string {
  return iconName
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function toIconLabel(iconName: string): string {
  return iconName
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function CoverImagePickerCustom({ onImageSelected, onClose }: CoverImagePickerCustomProps) {
  const [selectedColor, setSelectedColor] = useState<(typeof GRAPHIC_COVER_COLORS)[number]>(GRAPHIC_COVER_COLORS[0]);
  const [selectedIcon, setSelectedIcon] = useState<(typeof GRAPHIC_COVER_ICONS)[number]>(GRAPHIC_COVER_ICONS[0]);

  const IconComponent = graphicIconLookup[toGraphicIconKey(selectedIcon)];

  function handleApply() {
    try {
      onImageSelected(`graphic:${selectedColor}/${selectedIcon}`);
    } finally {
      onClose();
    }
  }

  return (
    <div className="flex flex-col gap-3 pt-2">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="cover-custom-color" className="text-sm font-medium">
            Background color
          </label>
          <select
            id="cover-custom-color"
            value={selectedColor}
            onChange={(event) => setSelectedColor(event.target.value as (typeof GRAPHIC_COVER_COLORS)[number])}
            style={selectStyles}
          >
            {GRAPHIC_COVER_COLORS.map((color) => (
              <option key={color} value={color}>
                {COLOR_LABELS[color]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="cover-custom-icon" className="text-sm font-medium">
            Icon
          </label>
          <select
            id="cover-custom-icon"
            value={selectedIcon}
            onChange={(event) => setSelectedIcon(event.target.value as (typeof GRAPHIC_COVER_ICONS)[number])}
            style={selectStyles}
          >
            {GRAPHIC_COVER_ICONS.map((iconName) => (
              <option key={iconName} value={iconName}>
                {toIconLabel(iconName)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div
        data-testid="cover-preview"
        className="flex w-full items-center justify-center overflow-hidden rounded-lg"
        style={{
          height: 120,
          background: selectedColor,
        }}
      >
        {IconComponent ? <IconComponent size={40} strokeWidth={1.5} style={{ color: "white" }} /> : null}
      </div>

      <Button type="button" onClick={handleApply}>
        Apply
      </Button>
    </div>
  );
}
