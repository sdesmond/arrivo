"use client";

import { useState } from "react";
import {
  Plane,
  Map,
  Compass,
  Camera,
  TentTree,
  Ship,
  Backpack,
  Luggage,
  Bus,
  Car,
  Mountain,
  TreePalm,
  Hotel,
  Road,
  Van,
  Caravan,
  MapPin,
  MapPinned,
  Trees,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { GRAPHIC_COVER_COLORS, GRAPHIC_COVER_ICONS, GRAPHIC_COVER_PATTERNS } from "@/lib/utils";

type LucideIcon = React.ComponentType<{ size?: number; strokeWidth?: number; style?: React.CSSProperties }>;

const ICON_COMPONENTS: Record<string, LucideIcon> = {
  Plane,
  Map,
  Compass,
  Camera,
  TentTree,
  Ship,
  Backpack,
  Luggage,
  Bus,
  Car,
  Mountain,
  TreePalm,
  Hotel,
  Road,
  Van,
  Caravan,
  MapPin,
  MapPinned,
  Trees,
};

const ICON_LABELS: Record<(typeof GRAPHIC_COVER_ICONS)[number], string> = {
  plane: "Plane",
  map: "Map",
  compass: "Compass",
  camera: "Camera",
  "tent-tree": "Tent",
  ship: "Ship",
  backpack: "Backpack",
  luggage: "Luggage",
  bus: "Bus",
  car: "Car",
  mountain: "Mountain",
  "tree-palm": "Palm Tree",
  hotel: "Hotel",
  road: "Road",
  van: "Van",
  caravan: "Caravan",
  "map-pin": "Pin",
  "map-pinned": "Pin & Map",
  trees: "Trees",
};

const PATTERN_LABELS: Record<(typeof GRAPHIC_COVER_PATTERNS)[number], string> = {
  horizontal: "Horizontal",
  vertical: "Vertical",
  slanted: "Slanted",
  crosshatch: "Crosshatch",
  dots: "Dots",
  none: "None",
};

const COLOR_LABELS: Record<(typeof GRAPHIC_COVER_COLORS)[number], string> = {
  "var(--color-indigo-400)": "Indigo",
  "var(--color-pink-400)": "Pink",
  "var(--color-teal-400)": "Teal",
  "var(--color-amber-400)": "Amber",
  "var(--color-red-400)": "Red",
  "var(--color-emerald-400)": "Emerald",
  "var(--color-slate-400)": "Slate",
  "var(--color-violet-400)": "Violet",
  "var(--color-orange-400)": "Orange",
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

export function CoverImagePickerCustom({ onImageSelected, onClose }: CoverImagePickerCustomProps) {
  const [selectedColor, setSelectedColor] = useState<(typeof GRAPHIC_COVER_COLORS)[number]>(GRAPHIC_COVER_COLORS[0]);
  const [selectedPattern, setSelectedPattern] = useState<(typeof GRAPHIC_COVER_PATTERNS)[number]>(
    GRAPHIC_COVER_PATTERNS[0]
  );
  const [selectedIcon, setSelectedIcon] = useState<(typeof GRAPHIC_COVER_ICONS)[number]>(GRAPHIC_COVER_ICONS[0]);

  const IconComponent = ICON_COMPONENTS[toGraphicIconKey(selectedIcon)];

  function handleApply() {
    try {
      onImageSelected(`graphic:${selectedColor}/${selectedPattern}/${selectedIcon}`);
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
                {ICON_LABELS[iconName]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="cover-custom-pattern" className="text-sm font-medium">
            Pattern
          </label>
          <select
            id="cover-custom-pattern"
            value={selectedPattern}
            onChange={(event) => setSelectedPattern(event.target.value as (typeof GRAPHIC_COVER_PATTERNS)[number])}
            style={selectStyles}
          >
            {GRAPHIC_COVER_PATTERNS.map((pattern) => (
              <option key={pattern} value={pattern}>
                {PATTERN_LABELS[pattern]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div
        data-testid="cover-preview"
        className="relative flex w-full items-center justify-center overflow-hidden rounded-lg"
        style={{
          height: 120,
          background: selectedColor,
        }}
      >
        {selectedPattern !== "none" && <div className={`cover-pattern-${selectedPattern} absolute inset-0`} />}
        {IconComponent ? <IconComponent size={40} strokeWidth={1.5} style={{ color: "white" }} /> : null}
      </div>

      <Button type="button" onClick={handleApply}>
        Apply
      </Button>
    </div>
  );
}
